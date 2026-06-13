import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { SupabaseGameRepository } from '~~/server/game/supabaseRepository'
import { resolveUserId } from '~~/server/utils/resolveUserId'
import { initialState } from '~~/server/game/initialState'
import { redactSnapshotFor } from '~~/server/game/redactSnapshot'
import { toPlayerId } from '~~/server/game/playerId'
import type { GameSnapshot } from '~~/shared/types/game'

export default defineEventHandler(async (event) => {
  const userId = await resolveUserId(event)
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const gameId = getRouterParam(event, 'id')
  if (!gameId) {
    throw createError({ statusCode: 400, statusMessage: 'Game id missing' })
  }

  const supabase = serverSupabaseServiceRole(event)
  const repo = new SupabaseGameRepository(supabase)
  const membership = await repo.getGameMembership(gameId, userId)
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a game member' })
  }

  const game = await repo.getGame(gameId)
  if (!game) {
    throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  }

  const query = getQuery(event)
  const requestedTurn = typeof query.turn === 'string' ? Number.parseInt(query.turn, 10) : undefined
  const turn = Number.isFinite(requestedTurn) ? requestedTurn! : game.turn

  const playerIds = await repo.listGamePlayers(gameId)
  let snapshot = await repo.getGameState(gameId, turn)
  if (!snapshot) {
    // Only bootstrap the opening snapshot. Never create state for an arbitrary
    // (client-supplied) turn — that would let a request write phantom snapshots.
    if (turn !== 1) {
      throw createError({ statusCode: 404, statusMessage: 'No snapshot for turn' })
    }
    snapshot = initialState(playerIds, turn)
    await repo.insertGameState(gameId, turn, snapshot)
  }

  const baseSnapshot = initialState(playerIds, turn)
  const baseResourcesById = new Map(baseSnapshot.players.map(player => [player.id, player.resources]))
  const patchedSnapshot: GameSnapshot = {
    ...snapshot,
    galaxies: snapshot.galaxies ?? baseSnapshot.galaxies,
    systems: snapshot.systems ?? baseSnapshot.systems,
    players: snapshot.players.map(player => ({
      ...player,
      resources: player.resources ?? structuredClone(baseResourcesById.get(player.id) ?? [])
    }))
  }

  // Fog of war: never ship another player's private state to the client.
  const redacted = redactSnapshotFor(patchedSnapshot, toPlayerId(userId))

  return { turn, snapshot: redacted }
})

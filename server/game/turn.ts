import { createError } from 'h3'
import { initialState } from './initialState'
import { validateTurnPlan } from './validateTurnPlan'
import { resolveTurn } from './resolveTurn'
import { toPlayerId } from './playerId'
import type { GameRepository } from './repository'

async function loadSnapshot(repo: GameRepository, gameId: string, turn: number, playerIds: string[]): Promise<GameSnapshot> {
  const existing = await repo.getGameState(gameId, turn)
  if (existing) return existing

  const snapshot = initialState(playerIds, turn)
  await repo.insertGameState(gameId, turn, snapshot)
  return snapshot
}

async function requireGame(repo: GameRepository, gameId: string) {
  const game = await repo.getGame(gameId)

  if (!game) {
    throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  }

  return game
}

async function requireMembership(repo: GameRepository, gameId: string, userId: string) {
  const membership = await repo.getGameMembership(gameId, userId)

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a game member' })
  }
}

export async function submitTurn(
  repo: GameRepository,
  userId: string,
  gameId: string,
  turn: number,
  plan: TurnPlan
): Promise<{ resolved: boolean }> {
  const game = await requireGame(repo, gameId)

  if (game.turn !== turn) {
    throw createError({ statusCode: 409, statusMessage: 'Turn mismatch' })
  }

  if (game.phase !== 'planning') {
    throw createError({ statusCode: 409, statusMessage: 'Game is resolving' })
  }

  await requireMembership(repo, gameId, userId)

  const playerIds = await repo.listGamePlayers(gameId)
  const snapshot = await loadSnapshot(repo, gameId, turn, playerIds)

  const playerId = toPlayerId(userId)
  const errors = validateTurnPlan(snapshot, playerId, plan)

  if (errors.length > 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid plan', data: { errors } satisfies { errors: ValidationError[] } })
  }

  await repo.upsertTurnPlan(gameId, turn, userId, plan, new Date().toISOString())
  await repo.markPlayerReady(gameId, userId, turn, new Date().toISOString())

  const resolveResult = await resolveTurn(repo, gameId, turn)

  return { resolved: resolveResult.resolved }
}

export async function unsubmitTurn(
  repo: GameRepository,
  userId: string,
  gameId: string,
  turn: number
): Promise<{ ok: boolean }> {
  const game = await requireGame(repo, gameId)

  if (game.turn !== turn) {
    throw createError({ statusCode: 409, statusMessage: 'Turn mismatch' })
  }

  if (game.phase === 'resolving') {
    throw createError({ statusCode: 409, statusMessage: 'Game is resolving' })
  }

  await requireMembership(repo, gameId, userId)
  await repo.clearTurnPlanSubmission(gameId, turn, userId)
  await repo.clearPlayerReady(gameId, userId)

  return { ok: true }
}

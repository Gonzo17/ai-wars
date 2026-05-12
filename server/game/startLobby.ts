import { createError } from 'h3'
import { initialState } from './initialState'
import type { GameRepository } from './repository'

export async function startLobbyGame(repo: GameRepository, userId: string, lobbyId: string): Promise<{ gameId: string }> {
  const lobby = await repo.getLobby(lobbyId)

  if (!lobby) {
    throw createError({ statusCode: 404, statusMessage: 'Lobby not found' })
  }

  const membership = await repo.getLobbyMembership(lobbyId, userId)
  const isListedPlayer = membership ? true : (await repo.listLobbyPlayers(lobbyId)).includes(userId)

  if (!membership && !isListedPlayer && lobby.host_id !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Not a lobby member' })
  }

  if (lobby.host_id && lobby.host_id !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Only host can start' })
  }

  if (lobby.status === 'started' && lobby.game_id) {
    return { gameId: lobby.game_id as string }
  }

  if (lobby.status !== 'open') {
    throw createError({ statusCode: 409, statusMessage: 'Lobby not open' })
  }

  const playerIds = await repo.listLobbyPlayers(lobbyId)
  if (!playerIds.includes(userId)) {
    playerIds.push(userId)
  }
  const gameId = await repo.createGame(userId)

  if (!gameId) {
    throw createError({ statusCode: 500, statusMessage: 'Game create failed' })
  }

  await repo.addGamePlayers(gameId, playerIds)

  const snapshot = initialState(playerIds)
  await repo.insertGameState(gameId, 1, snapshot)
  await repo.updateLobbyStarted(lobbyId, gameId, new Date().toISOString())

  return { gameId }
}

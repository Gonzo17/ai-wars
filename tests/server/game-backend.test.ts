import { describe, expect, it } from 'vitest'
import { startLobbyGame } from '../../server/game/startLobby'
import { submitTurn, unsubmitTurn } from '../../server/game/turn'
import { resolveTurn } from '../../server/game/resolveTurn'
import { initialState } from '../../server/game/initialState'
import { InMemoryGameRepository } from '../../server/game/inMemoryRepository'

describe('game backend', () => {
  it('start lobby is idempotent', async () => {
    const repo = new InMemoryGameRepository({
      lobbies: [{ id: 'l1', name: 'Lobby', host_id: 'u1', status: 'open', game_id: null }],
      lobby_players: [{ lobby_id: 'l1', user_id: 'u1', is_host: true }]
    })

    const first = await startLobbyGame(repo, 'u1', 'l1')
    const second = await startLobbyGame(repo, 'u1', 'l1')

    expect(first.gameId).toBe(second.gameId)
    expect(repo.data.games).toHaveLength(1)
    expect(repo.data.lobbies[0].status).toBe('started')
  })

  it('turn mismatch returns 409', async () => {
    const repo = new InMemoryGameRepository({
      games: [{ id: 'g1', turn: 2, phase: 'planning', status: 'active' }],
      game_players: [{ game_id: 'g1', user_id: 'u1' }],
      game_state: [{ game_id: 'g1', turn: 2, state_json: initialState(['u1'], 2) }]
    })

    const plan = { commands: [] }

    await expect(submitTurn(repo, 'u1', 'g1', 1, plan)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('unsubmit during resolving returns 409', async () => {
    const repo = new InMemoryGameRepository({
      games: [{ id: 'g1', turn: 1, phase: 'resolving', status: 'active' }],
      game_players: [{ game_id: 'g1', user_id: 'u1' }]
    })

    await expect(unsubmitTurn(repo, 'u1', 'g1', 1)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('lock prevents double resolve', async () => {
    const repo = new InMemoryGameRepository({
      games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null }],
      game_players: [
        { game_id: 'g1', user_id: 'u1' },
        { game_id: 'g1', user_id: 'u2' }
      ],
      game_state: [{ game_id: 'g1', turn: 1, state_json: initialState(['u1', 'u2'], 1) }],
      turn_plans: [
        { game_id: 'g1', turn: 1, user_id: 'u1', plan_json: { commands: [] }, submitted_at: new Date().toISOString() },
        { game_id: 'g1', turn: 1, user_id: 'u2', plan_json: { commands: [] }, submitted_at: new Date().toISOString() }
      ]
    })

    const first = await resolveTurn(repo, 'g1', 1)
    const second = await resolveTurn(repo, 'g1', 1)

    expect(first.resolved).toBe(true)
    expect(second.resolved).toBe(false)
    expect(repo.data.game_state.filter(row => row.turn === 2)).toHaveLength(1)
  })

  it('successful resolve increments turn and writes snapshot', async () => {
    const repo = new InMemoryGameRepository({
      games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null }],
      game_players: [
        { game_id: 'g1', user_id: 'u1' },
        { game_id: 'g1', user_id: 'u2' }
      ],
      game_state: [{ game_id: 'g1', turn: 1, state_json: initialState(['u1', 'u2'], 1) }],
      turn_plans: [
        { game_id: 'g1', turn: 1, user_id: 'u1', plan_json: { commands: [] }, submitted_at: new Date().toISOString() },
        { game_id: 'g1', turn: 1, user_id: 'u2', plan_json: { commands: [] }, submitted_at: new Date().toISOString() }
      ]
    })

    const result = await resolveTurn(repo, 'g1', 1)

    expect(result.resolved).toBe(true)
    expect(repo.data.games[0].turn).toBe(2)
    expect(repo.data.game_state.some(row => row.turn === 2)).toBe(true)
  })
})

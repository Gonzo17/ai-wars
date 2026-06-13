import { describe, expect, it } from 'vitest'
import { submitTurn } from '../../server/game/turn'
import { initialState } from '../../server/game/initialState'
import { InMemoryGameRepository } from '../../server/game/inMemoryRepository'
import { toPlayerId } from '../../server/game/playerId'
import type { GameSnapshot, Unit, UnitId } from '../../shared/types/game'
import type { TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'
const EMPTY: TurnPlan = { commands: [] }
const FLEET_ID = 'unit:probe@pl:aurora@t0' as UnitId

// Map topology (initialState): sys:lyra (u1 home) ↔ sys:nadir ↔ sys:vega (u2 home),
// sys:helix ↔ sys:nadir. So lyra→nadir = 1 lane, lyra→vega = 2 lanes.

function seedGame() {
  const repo = new InMemoryGameRepository({
    games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null } as never],
    game_players: [
      { game_id: 'g1', user_id: U1 },
      { game_id: 'g1', user_id: U2 }
    ],
    game_state: [{ game_id: 'g1', turn: 1, state_json: initialState([U1, U2], 1) }]
  })
  const state = getSnapshot(repo, 1)
  const fleet: Unit = {
    id: FLEET_ID,
    defId: 'unit:probe',
    type: 'probe',
    name: 'unit:probe',
    status: 'idle',
    location: 'pl:aurora',
    strength: 1,
    ownerId: toPlayerId(U1)
  }
  state.fleets.push(fleet)
  return repo
}

function getSnapshot(repo: InMemoryGameRepository, turn: number): GameSnapshot {
  const row = repo.data.game_state.find(r => r.game_id === 'g1' && r.turn === turn)
  expect(row).toBeDefined()
  return row!.state_json
}

async function playTurn(repo: InMemoryGameRepository, turn: number, plans: Partial<Record<string, TurnPlan>> = {}) {
  await submitTurn(repo, U1, 'g1', turn, plans[U1] ?? EMPTY)
  const result = await submitTurn(repo, U2, 'g1', turn, plans[U2] ?? EMPTY)
  expect(result.resolved).toBe(true)
}

const moveTo = (toSystemId: string): TurnPlan => ({
  commands: [{ type: 'moveFleet', fleetId: FLEET_ID, toSystemId: toSystemId as never }]
})

describe('star-lane fleet movement', () => {
  it('moves to an adjacent system in one turn and emits an arrival event', async () => {
    const repo = seedGame()

    await playTurn(repo, 1, { [U1]: moveTo('sys:nadir') })

    const next = getSnapshot(repo, 2)
    const fleet = next.fleets.find(f => f.id === FLEET_ID)!
    expect(fleet.location).toBe('sys:nadir')
    expect(fleet.status).toBe('idle')
    expect(fleet.destination).toBeUndefined()

    const events = next.players.find(p => p.id === toPlayerId(U1))!.events
    expect(events.some(e => e.type === 'army-arrived')).toBe(true)
  })

  it('travels one lane per turn over longer routes', async () => {
    const repo = seedGame()

    // lyra → vega is two lanes (via nadir)
    await playTurn(repo, 1, { [U1]: moveTo('sys:vega') })

    const mid = getSnapshot(repo, 2)
    const enRoute = mid.fleets.find(f => f.id === FLEET_ID)!
    expect(enRoute.location).toBe('sys:nadir')
    expect(enRoute.status).toBe('en-route')
    expect(enRoute.destination).toBe('sys:vega')
    expect(enRoute.eta).toBe(1)

    // No new order — fleet keeps moving on its own
    await playTurn(repo, 2)

    const done = getSnapshot(repo, 3)
    const arrived = done.fleets.find(f => f.id === FLEET_ID)!
    expect(arrived.location).toBe('sys:vega')
    expect(arrived.status).toBe('idle')
  })

  it('can be redirected mid-route', async () => {
    const repo = seedGame()

    await playTurn(repo, 1, { [U1]: moveTo('sys:vega') })
    // Fleet now sits at sys:nadir en-route to vega — redirect to helix (1 lane from nadir)
    await playTurn(repo, 2, { [U1]: moveTo('sys:helix') })

    const result = getSnapshot(repo, 3)
    const fleet = result.fleets.find(f => f.id === FLEET_ID)!
    expect(fleet.location).toBe('sys:helix')
    expect(fleet.status).toBe('idle')
  })

  it('rejects a move to an unknown system', async () => {
    const repo = seedGame()

    await expect(submitTurn(repo, U1, 'g1', 1, moveTo('sys:atlantis'))).rejects.toMatchObject({
      statusCode: 400,
      data: { errors: [{ code: 'NOT_FOUND', message: 'Target system not found' }] }
    })
  })

  it('rejects moving an enemy fleet', async () => {
    const repo = seedGame()

    await expect(submitTurn(repo, U2, 'g1', 1, moveTo('sys:nadir'))).rejects.toMatchObject({
      statusCode: 400,
      data: { errors: [{ code: 'NOT_OWNER' }] }
    })
  })
})

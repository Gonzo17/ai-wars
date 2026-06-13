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

function getSnapshot(repo: InMemoryGameRepository, turn: number): GameSnapshot {
  const row = repo.data.game_state.find(r => r.game_id === 'g1' && r.turn === turn)
  expect(row).toBeDefined()
  return row!.state_json
}

let shipCounter = 0
function placeFleet(snapshot: GameSnapshot, owner: string, defId: string, type: Unit['type'], strength: number, location: string) {
  snapshot.fleets.push({
    id: `${defId}#${shipCounter++}` as UnitId,
    defId: defId as UnitId,
    type,
    name: defId,
    status: 'idle',
    location: location as Unit['location'],
    strength,
    ownerId: toPlayerId(owner)
  })
}

function seedGame() {
  return new InMemoryGameRepository({
    games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null } as never],
    game_players: [
      { game_id: 'g1', user_id: U1 },
      { game_id: 'g1', user_id: U2 }
    ],
    game_state: [{ game_id: 'g1', turn: 1, state_json: initialState([U1, U2], 1) }]
  })
}

async function playTurn(repo: InMemoryGameRepository, turn: number) {
  await submitTurn(repo, U1, 'g1', turn, EMPTY)
  const result = await submitTurn(repo, U2, 'g1', turn, EMPTY)
  expect(result.resolved).toBe(true)
}

describe('fleet combat', () => {
  it('destroys the weaker fleet and reduces the winner when fleets clash', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    // Both meet at the neutral hub
    placeFleet(state, U1, 'unit:frigate', 'battleship', 4, 'sys:frontier')
    placeFleet(state, U1, 'unit:frigate', 'battleship', 4, 'sys:frontier') // offense 8
    placeFleet(state, U2, 'unit:frigate', 'battleship', 4, 'sys:frontier') // offense 4

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const u1Fleets = next.fleets.filter(f => f.ownerId === toPlayerId(U1))
    const u2Fleets = next.fleets.filter(f => f.ownerId === toPlayerId(U2))
    expect(u2Fleets).toHaveLength(0) // loser wiped out
    expect(u1Fleets).toHaveLength(1) // winner lost one of two frigates

    const u1Events = next.players.find(p => p.id === toPlayerId(U1))!.events
    const u2Events = next.players.find(p => p.id === toPlayerId(U2))!.events
    expect(u1Events.some(e => e.type === 'combat')).toBe(true)
    expect(u2Events.some(e => e.type === 'combat')).toBe(true)
  })

  it('leaves fleets untouched when only one owner is present', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    placeFleet(state, U1, 'unit:frigate', 'battleship', 4, 'sys:frontier')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    expect(next.fleets.filter(f => f.ownerId === toPlayerId(U1))).toHaveLength(1)
  })
})

describe('colonization', () => {
  it('captures an unclaimed planet with a colony ship', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    // pl:frontier-alpha is unclaimed in sys:frontier
    placeFleet(state, U1, 'unit:colony-ship', 'colonizer', 1, 'sys:frontier')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const outpost = next.planets.find(p => p.id === 'pl:frontier-alpha')!
    expect(outpost.owner).toBe(toPlayerId(U1))
    expect(next.players.find(p => p.id === toPlayerId(U1))!.planets).toContain('pl:frontier-alpha')
    // colony ship consumed
    expect(next.fleets.filter(f => f.defId === 'unit:colony-ship')).toHaveLength(0)
    // planetsControlled updated for ascension gates
    expect(next.players.find(p => p.id === toPlayerId(U1))!.research.empireState.planetsControlled).toBe(3)

    const events = next.players.find(p => p.id === toPlayerId(U1))!.events
    expect(events.some(e => e.type === 'colony-established')).toBe(true)
  })

  it('does not colonize a planet contested by an enemy fleet', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    placeFleet(state, U1, 'unit:colony-ship', 'colonizer', 1, 'sys:frontier')
    placeFleet(state, U2, 'unit:frigate', 'battleship', 4, 'sys:frontier') // contests the system

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const outpost = next.planets.find(p => p.id === 'pl:frontier-alpha')!
    expect(outpost.owner).toBe('unclaimed')
    // colony ship is destroyed in combat (weak), enemy frigate survives
    expect(next.fleets.some(f => f.ownerId === toPlayerId(U2))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { submitTurn } from '../../server/game/turn'
import { initialState } from '../../server/game/initialState'
import { InMemoryGameRepository } from '../../server/game/inMemoryRepository'
import { toPlayerId } from '../../server/game/playerId'
import { validateTurnPlan } from '../../shared/validation/turnPlan'
import type { BuildingId, GameSnapshot, Planet, PlanetSlotData, UnitId } from '../../shared/types/game'
import type { TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'
const EMPTY: TurnPlan = { commands: [] }

function getSnapshot(repo: InMemoryGameRepository, turn: number): GameSnapshot {
  return repo.data.game_state.find(r => r.game_id === 'g1' && r.turn === turn)!.state_json
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

async function playTurn(repo: InMemoryGameRepository, turn: number, p1: TurnPlan = EMPTY) {
  await submitTurn(repo, U1, 'g1', turn, p1)
  const result = await submitTurn(repo, U2, 'g1', turn, EMPTY)
  expect(result.resolved).toBe(true)
}

function completedSlot(index: number, buildingId: string, node: PlanetSlotData['resourceNode']): PlanetSlotData {
  return { index, zone: 'surface', buildingId: buildingId as BuildingId, buildingLevel: 1, isConstructing: false, constructionTimeLeft: 0, resourceNode: node }
}

function setResource(snapshot: GameSnapshot, user: string, key: string, current: number) {
  const res = snapshot.players.find(p => p.id === toPlayerId(user))!.resources.find(r => r.key === key)!
  res.current = current
}

/** Give U1 a barren expansion world (which carries an exotic-matter deposit). */
function ownBarrenWorld(state: GameSnapshot): Planet {
  const planet = state.planets.find(p => p.type === 'barren' && p.owner === 'unclaimed')!
  planet.owner = toPlayerId(U1)
  state.players.find(p => p.id === toPlayerId(U1))!.planets.push(planet.id)
  return planet
}

describe('strategic resources', () => {
  it('seeds every player with strategic resource stocks at zero', () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    const u1 = state.players.find(p => p.id === toPlayerId(U1))!
    expect(u1.resources.find(r => r.key === 'res:exotic-matter')?.current).toBe(0)
    expect(u1.resources.find(r => r.key === 'res:antimatter')?.current).toBe(0)
  })

  it('places exotic deposits on barren worlds and antimatter on gas giants', () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    const barren = state.planets.find(p => p.type === 'barren')!
    const gas = state.planets.find(p => p.type === 'gas-giant')!
    expect(barren.slots.some(s => s.resourceNode === 'exotic-matter')).toBe(true)
    expect(gas.slots.some(s => s.resourceNode === 'antimatter')).toBe(true)
  })

  it('mines exotic matter from an extractor on a deposit', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    const barren = ownBarrenWorld(state)
    const depositIndex = barren.slots.findIndex(s => s.resourceNode === 'exotic-matter')
    barren.slots[depositIndex] = completedSlot(depositIndex, 'bld:exotic-extractor', 'exotic-matter')

    await playTurn(repo, 1)

    const next = getSnapshot(repo, 2)
    const u1 = next.players.find(p => p.id === toPlayerId(U1))!
    const exotic = u1.resources.find(r => r.key === 'res:exotic-matter')!
    expect(exotic.current).toBe(4)
    expect(exotic.delta).toBe(4)
  })

  it('rejects an extractor placed off its deposit, allows it on the deposit', () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    const barren = ownBarrenWorld(state)
    setResource(state, U1, 'res:energy', 5000)
    setResource(state, U1, 'res:material', 5000)
    setResource(state, U1, 'res:rare', 5000)
    state.players.find(p => p.id === toPlayerId(U1))!.research.completedTechIds.push('tech:exotic-matter-survey')

    const depositIndex = barren.slots.findIndex(s => s.resourceNode === 'exotic-matter')
    const emptyNonDeposit = barren.slots.findIndex((s, i) => i !== depositIndex && s.zone === 'surface' && !s.resourceNode && !s.buildingId)

    const offDeposit: TurnPlan = { commands: [{ type: 'setProductionQueue', planetId: barren.id, items: [{ kind: 'building', slotIndex: emptyNonDeposit, buildingId: 'bld:exotic-extractor' as BuildingId }] }] }
    expect(validateTurnPlan(state, toPlayerId(U1), offDeposit).length).toBeGreaterThan(0)

    const onDeposit: TurnPlan = { commands: [{ type: 'setProductionQueue', planetId: barren.id, items: [{ kind: 'building', slotIndex: depositIndex, buildingId: 'bld:exotic-extractor' as BuildingId }] }] }
    expect(validateTurnPlan(state, toPlayerId(U1), onDeposit)).toHaveLength(0)
  })

  it('gates a strategic-cost build on having the resource', async () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    // Own the home star to build a Dyson sphere (needs exotic matter).
    const homeworld = state.planets.find(p => p.owner === toPlayerId(U1) && p.kind !== 'star')!
    const star = state.planets.find(p => p.kind === 'star' && p.systemId === homeworld.systemId)!
    star.owner = toPlayerId(U1)
    setResource(state, U1, 'res:material', 5000)
    setResource(state, U1, 'res:rare', 5000)

    const dyson: TurnPlan = { commands: [{ type: 'setProductionQueue', planetId: star.id, items: [{ kind: 'building', slotIndex: 0, buildingId: 'bld:dyson-sphere' as BuildingId }] }] }
    // No exotic matter yet → rejected.
    expect(validateTurnPlan(state, toPlayerId(U1), dyson).length).toBeGreaterThan(0)

    // With exotic matter → accepted, and the build consumes it.
    setResource(state, U1, 'res:exotic-matter', 100)
    expect(validateTurnPlan(state, toPlayerId(U1), dyson)).toHaveLength(0)

    await playTurn(repo, 1, dyson)
    const next = getSnapshot(repo, 2)
    const exotic = next.players.find(p => p.id === toPlayerId(U1))!.resources.find(r => r.key === 'res:exotic-matter')!
    expect(exotic.current).toBe(50)
  })

  it('requires antimatter to build a dreadnought', () => {
    const repo = seedGame()
    const state = getSnapshot(repo, 1)
    const homeworld = state.planets.find(p => p.owner === toPlayerId(U1) && p.kind !== 'star')!
    setResource(state, U1, 'res:energy', 5000)
    setResource(state, U1, 'res:material', 5000)
    setResource(state, U1, 'res:rare', 5000)
    state.players.find(p => p.id === toPlayerId(U1))!.research.completedTechIds.push('tech:antimatter-containment')

    const dreadnought: TurnPlan = { commands: [{ type: 'setProductionQueue', planetId: homeworld.id, items: [{ kind: 'unit', unitId: 'unit:dreadnought' as UnitId }] }] }
    expect(validateTurnPlan(state, toPlayerId(U1), dreadnought).length).toBeGreaterThan(0)

    setResource(state, U1, 'res:antimatter', 50)
    expect(validateTurnPlan(state, toPlayerId(U1), dreadnought)).toHaveLength(0)
  })
})

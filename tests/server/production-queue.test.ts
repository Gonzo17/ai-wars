import { describe, expect, it } from 'vitest'
import { submitTurn } from '../../server/game/turn'
import { initialState } from '../../server/game/initialState'
import { InMemoryGameRepository } from '../../server/game/inMemoryRepository'
import { toPlayerId } from '../../server/game/playerId'
import { validateTurnPlan } from '../../shared/validation/turnPlan'
import type { GameSnapshot, PlayerSnapshot, ResourceId } from '../../shared/types/game'
import type { ProductionQueueCommandItem, TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'
const EMPTY: TurnPlan = { commands: [] }
const HOME = 'pl:aurora'

const queueCmd = (planetId: string, items: ProductionQueueCommandItem[]): TurnPlan =>
  ({ commands: [{ type: 'setProductionQueue', planetId: planetId as never, items }] })

const building = (slotIndex: number, buildingId: string): ProductionQueueCommandItem =>
  ({ kind: 'building', slotIndex, buildingId: buildingId as never })
const unit = (unitId: string): ProductionQueueCommandItem => ({ kind: 'unit', unitId: unitId as never })
const project = (projectId: string): ProductionQueueCommandItem => ({ kind: 'project', projectId: projectId as never })

function seedGame() {
  return new InMemoryGameRepository({
    games: [{ id: 'g1', turn: 1, phase: 'planning', status: 'active', resolving_turn: null } as never],
    game_players: [{ game_id: 'g1', user_id: U1 }, { game_id: 'g1', user_id: U2 }],
    game_state: [{ game_id: 'g1', turn: 1, state_json: initialState([U1, U2], 1) }]
  })
}

async function playTurn(repo: InMemoryGameRepository, turn: number, plan?: TurnPlan) {
  await submitTurn(repo, U1, 'g1', turn, plan ?? EMPTY)
  const result = await submitTurn(repo, U2, 'g1', turn, EMPTY)
  expect(result.resolved).toBe(true)
}

function getSnapshot(repo: InMemoryGameRepository, turn: number): GameSnapshot {
  return repo.data.game_state.find(r => r.game_id === 'g1' && r.turn === turn)!.state_json
}

function getPlayer(snapshot: GameSnapshot, userId: string): PlayerSnapshot {
  return snapshot.players.find(p => p.id === toPlayerId(userId))!
}

function getResource(player: PlayerSnapshot, key: ResourceId): number {
  return player.resources.find(r => r.key === key)?.current ?? Number.NaN
}

function homePlanet(snapshot: GameSnapshot) {
  return snapshot.planets.find(p => p.id === HOME)!
}

/**
 * The data center (Research district) must come first — every other district is gated
 * on it. Seed a completed one (surface slot 6, untouched by these tests) so we can test
 * the rest of the queue mechanics directly.
 */
function establishResearch(snapshot: GameSnapshot) {
  const slot = homePlanet(snapshot).slots[6]!
  slot.districtType = 'research'
  slot.nodes = ['bld:data-center' as never]
}

describe('shared production queue', () => {
  it('only the front item progresses; the rest wait in order', async () => {
    const repo = seedGame()
    establishResearch(getSnapshot(repo, 1))
    // mining on the ore node (slot 2) first, solar (slot 3) second.
    const plan = queueCmd(HOME, [building(2, 'bld:mining-facility'), building(3, 'bld:solar-array')])

    await playTurn(repo, 1, plan)

    const planet = homePlanet(getSnapshot(repo, 2))
    expect(planet.queues.production).toHaveLength(2)
    // Front building progressed (60 cost − 20 production)…
    expect(planet.slots[2]!.isConstructing).toBe(true)
    expect(planet.slots[2]!.constructionTimeLeft).toBe(40)
    // …the second is set up but untouched (full cost remaining).
    expect(planet.slots[3]!.isConstructing).toBe(true)
    expect(planet.slots[3]!.constructionTimeLeft).toBe(60)
  })

  it('completes items in order across turns', async () => {
    const repo = seedGame()
    establishResearch(getSnapshot(repo, 1))
    const plan = queueCmd(HOME, [building(2, 'bld:mining-facility'), building(3, 'bld:solar-array')])
    await playTurn(repo, 1, plan)
    // mining 60 at 20/turn → 60 → 40 → 20 → completes (turn 3 resolve), no overflow.
    await playTurn(repo, 2)
    await playTurn(repo, 3)

    const afterMining = homePlanet(getSnapshot(repo, 4))
    expect(afterMining.slots[2]!.isConstructing).toBe(false)
    expect(afterMining.slots[2]!.nodes).toContain('bld:mining-facility')
    expect(afterMining.queues.production).toHaveLength(1)
    expect(afterMining.queues.production[0]).toMatchObject({ kind: 'building', slotIndex: 3 })
    // Exact completion → no overflow; the next item is untouched this turn.
    expect(afterMining.productionCarryover).toBe(0)
    expect(afterMining.slots[3]!.constructionTimeLeft).toBe(60)

    // Next turn the solar build gets 20 production.
    await playTurn(repo, 4)
    expect(homePlanet(getSnapshot(repo, 5)).slots[3]!.constructionTimeLeft).toBe(60 - 20)
  })

  it('reordering keeps a unit\'s production progress with the item', async () => {
    const repo = seedGame()
    const seed = getSnapshot(repo, 1)
    const p1 = getPlayer(seed, U1)
    for (const r of p1.resources) r.current = 5000
    // Both units need an orbital dock (the empty start has none) + their design tech.
    const dock = homePlanet(seed).slots.find(s => s.zone === 'orbital')!
    dock.buildingId = 'bld:orbital-dock' as never
    dock.buildingLevel = 1
    p1.research.completedTechIds.push('tech:probe-design', 'tech:colony-ship-design')

    // Queue probe then colony-ship. 20 production/turn → the front probe gets 20.
    await playTurn(repo, 1, queueCmd(HOME, [unit('unit:probe'), unit('unit:colony-ship')]))
    const probeStarted = homePlanet(getSnapshot(repo, 2)).queues.production
    expect(probeStarted[0]).toMatchObject({ kind: 'unit', unitId: 'unit:probe', productionSpent: 20 })

    // Reorder to [colony-ship, probe]; the colony ship is now front and gets 20.
    await playTurn(repo, 2, queueCmd(HOME, [unit('unit:colony-ship'), unit('unit:probe')]))

    const after = homePlanet(getSnapshot(repo, 3)).queues.production
    expect(after).toHaveLength(2)
    expect(after[0]).toMatchObject({ kind: 'unit', unitId: 'unit:colony-ship', productionSpent: 20 })
    // The probe moved to the back but KEPT its 20 progress (not reset to 0 by the reorder).
    expect(after[1]).toMatchObject({ kind: 'unit', unitId: 'unit:probe', productionSpent: 20 })
  })

  it('cancelling a queued build frees the slot and does not refund', async () => {
    const repo = seedGame()
    establishResearch(getSnapshot(repo, 1))
    // Solar (50 minerals). Home starts with 100 minerals.
    await playTurn(repo, 1, queueCmd(HOME, [building(3, 'bld:solar-array')]))
    const charged = homePlanet(getSnapshot(repo, 2))
    expect(charged.slots[3]!.isConstructing).toBe(true)
    expect(getResource(getPlayer(getSnapshot(repo, 2), U1), 'res:material')).toBe(50)

    // Empty queue = cancel. Slot frees; the 50 already paid is NOT refunded.
    await playTurn(repo, 2, queueCmd(HOME, []))
    const cancelled = homePlanet(getSnapshot(repo, 3))
    expect(cancelled.slots[3]!.isConstructing).toBe(false)
    expect(cancelled.slots[3]!.buildingId).toBeNull()
    expect(cancelled.queues.production).toHaveLength(0)
    expect(getResource(getPlayer(getSnapshot(repo, 3), U1), 'res:material')).toBe(50)
  })
})

describe('projects', () => {
  function foundEnergyDistrict(snapshot: GameSnapshot) {
    const slot = homePlanet(snapshot).slots[0]!
    slot.districtType = 'energy'
    slot.nodes = ['bld:solar-array' as never]
  }

  it('rejects a project whose district is not founded, allows it once founded', () => {
    const snap = initialState([U1, U2], 1)
    const reserve = queueCmd(HOME, [project('proj:energy-reserve')])
    expect(validateTurnPlan(snap, toPlayerId(U1), reserve).length).toBeGreaterThan(0)

    foundEnergyDistrict(snap)
    expect(validateTurnPlan(snap, toPlayerId(U1), reserve)).toHaveLength(0)
  })

  it('consumes production, yields its output on completion, then pops (no resource cost)', async () => {
    const repo = seedGame()
    const seed = getSnapshot(repo, 1)
    foundEnergyDistrict(seed)
    const e0 = getResource(getPlayer(seed, U1), 'res:energy')

    // Energy reserve: cost 70, base production 20/turn → completes on turn 4.
    await playTurn(repo, 1, queueCmd(HOME, [project('proj:energy-reserve')]))
    // Still running, charged nothing up-front.
    expect(homePlanet(getSnapshot(repo, 2)).queues.production).toHaveLength(1)

    await playTurn(repo, 2)
    await playTurn(repo, 3)
    await playTurn(repo, 4)

    const after = getSnapshot(repo, 5)
    // Completed → popped from the queue.
    expect(homePlanet(after).queues.production).toHaveLength(0)
    // Energy = start + solar (20/turn × 4) + the project's +90 lump.
    expect(getResource(getPlayer(after, U1), 'res:energy')).toBe(e0 + 80 + 90)
  })
})

describe('production queue validation', () => {
  it('rejects a queue longer than the limit', () => {
    const snap = initialState([U1, U2], 1)
    const player = getPlayer(snap, U1)
    for (const r of player.resources) r.current = 100000
    const sevenUnits = queueCmd(HOME, Array.from({ length: 7 }, () => unit('unit:probe')))
    const errors = validateTurnPlan(snap, toPlayerId(U1), sevenUnits)
    expect(errors.some(e => e.message === 'Build queue full')).toBe(true)
  })

  it('rejects two builds targeting the same slot', () => {
    const snap = initialState([U1, U2], 1)
    const player = getPlayer(snap, U1)
    for (const r of player.resources) r.current = 100000
    establishResearch(snap)
    const dup = queueCmd(HOME, [building(3, 'bld:solar-array'), building(3, 'bld:mining-facility')])
    const errors = validateTurnPlan(snap, toPlayerId(U1), dup)
    expect(errors.some(e => e.message === 'Two builds target the same slot')).toBe(true)
  })

  it('checks affordability cumulatively across the queue', () => {
    const snap = initialState([U1, U2], 1)
    const player = getPlayer(snap, U1)
    // Exactly enough minerals for ONE solar array (50).
    player.resources.find(r => r.key === 'res:material')!.current = 50
    player.resources.find(r => r.key === 'res:energy')!.current = 0
    establishResearch(snap)
    const two = queueCmd(HOME, [building(3, 'bld:solar-array'), building(2, 'bld:solar-array')])
    const errors = validateTurnPlan(snap, toPlayerId(U1), two)
    expect(errors.some(e => e.code === 'INSUFFICIENT_RESOURCES')).toBe(true)
  })
})

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

describe('shared production queue', () => {
  it('only the front item progresses; the rest wait in order', async () => {
    const repo = seedGame()
    // mining on the ore node (slot 2) first, solar (slot 3) second.
    const plan = queueCmd(HOME, [building(2, 'bld:mining-facility'), building(3, 'bld:solar-array')])

    await playTurn(repo, 1, plan)

    const planet = homePlanet(getSnapshot(repo, 2))
    expect(planet.queues.production).toHaveLength(2)
    // Front building progressed (57 adjusted − 20)…
    expect(planet.slots[2]!.isConstructing).toBe(true)
    expect(planet.slots[2]!.constructionTimeLeft).toBeLessThan(57)
    // …the second is set up but untouched (full cost remaining).
    expect(planet.slots[3]!.isConstructing).toBe(true)
    expect(planet.slots[3]!.constructionTimeLeft).toBe(60)
  })

  it('completes items in order across turns, carrying overflow to the next', async () => {
    const repo = seedGame()
    const plan = queueCmd(HOME, [building(2, 'bld:mining-facility'), building(3, 'bld:solar-array')])
    await playTurn(repo, 1, plan)
    // 57 → 37 → 17 → completes (turn 3 resolve), overflow 3 carried.
    await playTurn(repo, 2)
    await playTurn(repo, 3)

    const afterMining = homePlanet(getSnapshot(repo, 4))
    expect(afterMining.slots[2]!.isConstructing).toBe(false)
    expect(afterMining.queues.production).toHaveLength(1)
    expect(afterMining.queues.production[0]).toMatchObject({ kind: 'building', slotIndex: 3 })
    // Overflow (20 − 17 remaining) is held for next turn; the next item is untouched this turn.
    expect(afterMining.productionCarryover).toBe(3)
    expect(afterMining.slots[3]!.constructionTimeLeft).toBe(60)

    // Next turn the solar build gets 20 production + 3 carried over = 23.
    await playTurn(repo, 4)
    expect(homePlanet(getSnapshot(repo, 5)).slots[3]!.constructionTimeLeft).toBe(60 - 23)
  })

  it('reordering keeps a unit\'s production progress with the item', async () => {
    const repo = seedGame()
    const seed = getSnapshot(repo, 1)
    const p1 = getPlayer(seed, U1)
    for (const r of p1.resources) r.current = 5000
    p1.research.completedTechIds.push('tech:probe-design') // probe needs this + the home orbital dock

    // Queue probe (cost 60) then worker (cost 20). 20 production/turn → probe gets 20.
    await playTurn(repo, 1, queueCmd(HOME, [unit('unit:probe'), unit('unit:worker')]))
    const probeStarted = homePlanet(getSnapshot(repo, 2)).queues.production
    expect(probeStarted[0]).toMatchObject({ kind: 'unit', unitId: 'unit:probe', productionSpent: 20 })

    // Reorder to [worker, probe]; the worker completes this turn (front).
    await playTurn(repo, 2, queueCmd(HOME, [unit('unit:worker'), unit('unit:probe')]))

    const after = homePlanet(getSnapshot(repo, 3))
    expect(after.workers).toBe(2) // worker finished
    // The probe is now the sole queued item and KEPT its 20 progress (not reset to 0).
    expect(after.queues.production).toHaveLength(1)
    expect(after.queues.production[0]).toMatchObject({ kind: 'unit', unitId: 'unit:probe', productionSpent: 20 })
  })

  it('cancelling a queued build frees the slot and does not refund', async () => {
    const repo = seedGame()
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

describe('production queue validation', () => {
  it('rejects a queue longer than the limit', () => {
    const snap = initialState([U1, U2], 1)
    const player = getPlayer(snap, U1)
    for (const r of player.resources) r.current = 100000
    const sevenWorkers = queueCmd(HOME, Array.from({ length: 7 }, () => unit('unit:worker')))
    const errors = validateTurnPlan(snap, toPlayerId(U1), sevenWorkers)
    expect(errors.some(e => e.message === 'Build queue full')).toBe(true)
  })

  it('rejects two builds targeting the same slot', () => {
    const snap = initialState([U1, U2], 1)
    const player = getPlayer(snap, U1)
    for (const r of player.resources) r.current = 100000
    const dup = queueCmd(HOME, [building(3, 'bld:solar-array'), building(3, 'bld:mining-facility')])
    const errors = validateTurnPlan(snap, toPlayerId(U1), dup)
    expect(errors.some(e => e.message === 'Two builds target the same slot')).toBe(true)
  })

  it('escalates worker cost per queued robot in the same turn', () => {
    const snap = initialState([U1, U2], 1)
    const player = getPlayer(snap, U1)
    // Budget = exactly 3 workers at the FLAT base cost (20e/10m each = 60e/30m).
    // With per-queue escalation the 2nd and 3rd cost more, so 3 must NOT fit.
    player.resources.find(r => r.key === 'res:energy')!.current = 60
    player.resources.find(r => r.key === 'res:material')!.current = 30
    player.resources.find(r => r.key === 'res:rare')!.current = 0
    const homeworld = homePlanet(snap)
    homeworld.workers = 1

    const threeRobots = queueCmd(HOME, [unit('unit:worker'), unit('unit:worker'), unit('unit:worker')])
    expect(validateTurnPlan(snap, toPlayerId(U1), threeRobots).some(e => e.code === 'INSUFFICIENT_RESOURCES')).toBe(true)

    // A single robot at the flat base cost still fits.
    expect(validateTurnPlan(snap, toPlayerId(U1), queueCmd(HOME, [unit('unit:worker')]))).toHaveLength(0)
  })

  it('checks affordability cumulatively across the queue', () => {
    const snap = initialState([U1, U2], 1)
    const player = getPlayer(snap, U1)
    // Exactly enough minerals for ONE solar array (50).
    player.resources.find(r => r.key === 'res:material')!.current = 50
    player.resources.find(r => r.key === 'res:energy')!.current = 0
    const two = queueCmd(HOME, [building(3, 'bld:solar-array'), building(2, 'bld:solar-array')])
    const errors = validateTurnPlan(snap, toPlayerId(U1), two)
    expect(errors.some(e => e.code === 'INSUFFICIENT_RESOURCES')).toBe(true)
  })
})

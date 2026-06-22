import { describe, expect, it } from 'vitest'
import { initialState } from '../../server/game/initialState'
import { toPlayerId } from '../../server/game/playerId'
import { validateTurnPlan } from '../../shared/validation/turnPlan'
import { calculateResourceProduction } from '../../shared/utils/economy'
import type { GameSnapshot, PlayerSnapshot } from '../../shared/types/game'
import type { ProductionQueueCommandItem, TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'
const HOME = 'pl:aurora'

const queueCmd = (planetId: string, items: ProductionQueueCommandItem[]): TurnPlan =>
  ({ commands: [{ type: 'setProductionQueue', planetId: planetId as never, items }] })
const building = (slotIndex: number, buildingId: string): ProductionQueueCommandItem =>
  ({ kind: 'building', slotIndex, buildingId: buildingId as never })

function getPlayer(snapshot: GameSnapshot, userId: string): PlayerSnapshot {
  return snapshot.players.find(p => p.id === toPlayerId(userId))!
}
function homePlanet(snapshot: GameSnapshot) {
  return snapshot.planets.find(p => p.id === HOME)!
}
/** Strip the homeworld's seeded legacy buildings so we start from a clean slate. */
function clearHomeBuildings(snapshot: GameSnapshot) {
  for (const slot of homePlanet(snapshot).slots) {
    slot.buildingId = null
    slot.buildingLevel = 0
    slot.isConstructing = false
    slot.districtType = null
    slot.nodes = []
  }
}
function setRich(player: PlayerSnapshot) {
  for (const r of player.resources) r.current = 5000
}
/** Seed a completed Research district so other districts pass the "data center first" gate. */
function establishResearch(snapshot: GameSnapshot) {
  const slot = homePlanet(snapshot).slots[6]!
  slot.districtType = 'research'
  slot.nodes = ['bld:data-center' as never]
}

describe('district economy', () => {
  it('sums every node in a district (cumulative output)', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
    const planet = homePlanet(snap)
    // An energy district with both reactor-line nodes built.
    planet.slots[0]!.districtType = 'energy'
    planet.slots[0]!.nodes = ['bld:solar-array' as never, 'bld:fusion-core' as never]

    // terrestrial energy weight = 1 → 20 (solar) + 50 (fusion) = 70.
    expect(calculateResourceProduction(snap.planets, toPlayerId(U1)).energy).toBe(70)
  })

  it('reports gross energy (costs are one-time, no running upkeep)', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
    const planet = homePlanet(snap)
    planet.slots[0]!.districtType = 'energy'
    planet.slots[0]!.nodes = ['bld:solar-array' as never] // +20 energy
    planet.slots[1]!.districtType = 'matter'
    // The refinery produces matter, not energy, and draws no upkeep → energy is just solar.
    planet.slots[1]!.nodes = ['bld:mining-facility' as never, 'bld:refinery-node' as never]

    expect(calculateResourceProduction(snap.planets, toPlayerId(U1)).energy).toBe(20)
  })
})

describe('district validation', () => {
  it('enforces exclusive branch groups within a district', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
    establishResearch(snap)
    setRich(getPlayer(snap, U1))
    getPlayer(snap, U1).research.completedTechIds.push('tech:planetary-grid-management')
    // An energy district that already committed to the fusion branch.
    const slot = homePlanet(snap).slots[0]!
    slot.districtType = 'energy'
    slot.nodes = ['bld:solar-array' as never, 'bld:fusion-core' as never]

    // power-relay is the exclusive sibling of fusion-core (branchGroup 'core') → rejected.
    const errs = validateTurnPlan(snap, toPlayerId(U1), queueCmd(HOME, [building(0, 'bld:power-relay')]))
    expect(errs.some(e => e.message === 'Another branch already chosen in this district')).toBe(true)
  })

  it('rejects a district not available on the planet type', () => {
    const snap = initialState([U1, U2], 1)
    setRich(getPlayer(snap, U1))
    // Matter district is NOT available on gas-giants; find/relabel the homeworld as one.
    homePlanet(snap).type = 'gas-giant'
    const errs = validateTurnPlan(snap, toPlayerId(U1), queueCmd(HOME, [building(2, 'bld:mining-facility')]))
    expect(errs.some(e => e.message === 'District not available on this planet type')).toBe(true)
  })

  it('terrain forbids a research district on mountains but allows it on plains', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
    setRich(getPlayer(snap, U1))
    const planet = homePlanet(snap)
    planet.slots[3]!.terrain = 'mountains'
    planet.slots[4]!.terrain = 'plains'

    const onMountain = validateTurnPlan(snap, toPlayerId(U1), queueCmd(HOME, [building(3, 'bld:data-center')]))
    expect(onMountain.some(e => e.message === 'District not allowed on this terrain')).toBe(true)

    expect(validateTurnPlan(snap, toPlayerId(U1), queueCmd(HOME, [building(4, 'bld:data-center')]))).toHaveLength(0)
  })

  it('scales a district output by its terrain (energy on volcanic ×1.4)', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
    const planet = homePlanet(snap)
    planet.slots[0]!.terrain = 'volcanic'
    planet.slots[0]!.districtType = 'energy'
    planet.slots[0]!.nodes = ['bld:solar-array' as never]

    // solar 20 × volcanic energy 1.4 = 28
    expect(calculateResourceProduction(snap.planets, toPlayerId(U1)).energy).toBe(28)
  })
})

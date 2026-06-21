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

describe('district economy', () => {
  it('sums every node in a district (cumulative output)', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
    const planet = homePlanet(snap)
    // An energy district with both reactor-line nodes built.
    planet.slots[0]!.districtType = 'energy'
    planet.slots[0]!.nodes = ['bld:solar-array' as never, 'bld:fusion-core' as never]

    // terrestrial energy weight = 1 → 20 (solar) + 50 (fusion) = 70, no upkeep.
    expect(calculateResourceProduction(snap.planets, toPlayerId(U1)).energy).toBe(70)
  })

  it('nets district upkeep out of the energy flow', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
    const planet = homePlanet(snap)
    planet.slots[0]!.districtType = 'energy'
    planet.slots[0]!.nodes = ['bld:solar-array' as never] // +20 energy
    planet.slots[1]!.districtType = 'matter'
    planet.slots[1]!.nodes = ['bld:mining-facility' as never] // −5 upkeep

    expect(calculateResourceProduction(snap.planets, toPlayerId(U1)).energy).toBe(15)
  })
})

describe('district validation', () => {
  it('rejects a consumer district when energy flow would go negative', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap) // no energy income at all
    setRich(getPlayer(snap, U1))

    // Mining (Matter district, −5 upkeep) alone → net flow 0 − 5 < 0 → rejected.
    const errs = validateTurnPlan(snap, toPlayerId(U1), queueCmd(HOME, [building(2, 'bld:mining-facility')]))
    expect(errs.some(e => e.code === 'INSUFFICIENT_RESOURCES')).toBe(true)

    // But queuing the energy producer first (+20) covers the upkeep → allowed.
    const ok = validateTurnPlan(snap, toPlayerId(U1), queueCmd(HOME, [building(0, 'bld:solar-array'), building(2, 'bld:mining-facility')]))
    expect(ok).toHaveLength(0)
  })

  it('enforces exclusive branch groups within a district', () => {
    const snap = initialState([U1, U2], 1)
    clearHomeBuildings(snap)
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
})

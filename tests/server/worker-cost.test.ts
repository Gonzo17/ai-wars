import { describe, expect, it } from 'vitest'
import { initialState } from '../../server/game/initialState'
import { toPlayerId } from '../../server/game/playerId'
import { WORKER_COST_GROWTH, getUnitBuildCost, getUnitDef } from '../../shared/defs/production'
import { validateTurnPlan } from '../../shared/validation/turnPlan'
import type { PlayerSnapshot } from '../../shared/types/game'
import type { TurnPlan } from '../../shared/types/turn'

const U1 = 'u1'
const U2 = 'u2'

const setRes = (player: PlayerSnapshot, key: string, current: number) => {
  const r = player.resources.find(res => res.key === key)
  if (r) r.current = current
}

describe('getUnitBuildCost', () => {
  const worker = getUnitDef('unit:worker')!
  const frigate = getUnitDef('unit:frigate')!

  it('keeps non-worker units at their flat cost', () => {
    expect(getUnitBuildCost(frigate, 5)).toEqual(frigate.resourceCosts)
  })

  it('charges base for the first worker and escalates per existing worker', () => {
    expect(getUnitBuildCost(worker, 1)).toEqual(worker.resourceCosts)
    expect(getUnitBuildCost(worker, 2).energy).toBe(Math.round(worker.resourceCosts.energy * (1 + WORKER_COST_GROWTH)))
    expect(getUnitBuildCost(worker, 3).energy).toBe(Math.round(worker.resourceCosts.energy * (1 + 2 * WORKER_COST_GROWTH)))
  })
})

describe('escalating worker cost is enforced in validation', () => {
  function setup() {
    const snap = initialState([U1, U2], 1)
    const p1 = toPlayerId(U1)
    const homeworld = snap.planets.find(p => p.owner === p1 && p.kind !== 'star')!
    const player = snap.players.find(pl => pl.id === p1)!
    const worker = getUnitDef('unit:worker')!
    // Budget = exactly one base-cost worker.
    setRes(player, 'res:energy', worker.resourceCosts.energy)
    setRes(player, 'res:material', worker.resourceCosts.minerals)
    setRes(player, 'res:rare', worker.resourceCosts.rare)
    const plan: TurnPlan = { commands: [{ type: 'setProductionQueue', planetId: homeworld.id, items: [{ kind: 'unit', unitId: 'unit:worker' }] }] }
    return { snap, p1, homeworld, plan }
  }

  it('affords a worker at base cost (1 worker present)', () => {
    const { snap, p1, homeworld, plan } = setup()
    homeworld.workers = 1
    expect(validateTurnPlan(snap, p1, plan)).toHaveLength(0)
  })

  it('rejects the same budget once the cost has escalated (3 workers present)', () => {
    const { snap, p1, homeworld, plan } = setup()
    homeworld.workers = 3
    expect(validateTurnPlan(snap, p1, plan).some(e => e.code === 'INSUFFICIENT_RESOURCES')).toBe(true)
  })
})

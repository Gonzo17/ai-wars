import { describe, expect, it } from 'vitest'
import { initialState } from '../../server/game/initialState'
import { toPlayerId } from '../../server/game/playerId'
import { calculateResourceProduction, resourceProductionBreakdown } from '../../shared/utils/economy'

describe('resourceProductionBreakdown', () => {
  it('groups energy by planet then building and sums to the headline total', () => {
    const snap = initialState(['u1', 'u2'], 1)
    const p1 = toPlayerId('u1')

    const breakdown = resourceProductionBreakdown(snap.planets, p1)
    const totals = calculateResourceProduction(snap.planets, p1)

    // The homeworld is an energy group, and its fusion core is a source within it.
    const homeworld = snap.planets.find(p => p.owner === p1 && p.isHomeworld)!
    const homeGroup = breakdown.energy.find(g => g.planetId === homeworld.id)
    expect(homeGroup).toBeDefined()
    expect(homeGroup!.sources.some(s => s.buildingId === 'bld:fusion-core')).toBe(true)
    // A group's subtotal equals the sum of its sources.
    expect(homeGroup!.total).toBe(homeGroup!.sources.reduce((acc, s) => acc + s.amount, 0))

    // All planet groups together add up to the headline production figure.
    const sum = breakdown.energy.reduce((acc, g) => acc + g.total, 0)
    expect(sum).toBe(totals.energy)

    // Sources within a group, and groups themselves, are sorted descending.
    expect(homeGroup!.sources).toEqual([...homeGroup!.sources].sort((a, b) => b.amount - a.amount))
    expect(breakdown.energy).toEqual([...breakdown.energy].sort((a, b) => b.total - a.total))
  })
})

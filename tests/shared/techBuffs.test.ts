import { describe, expect, it } from 'vitest'
import { aggregateTechEffects, lockedDoctrineGroups } from '../../shared/utils/techBuffs'
import type { TechDef } from '../../shared/types/research'

const tech = (over: Partial<TechDef> & { id: string }): TechDef => ({
  name: over.id, category: 'energy_compute', tier: 'k0.6', prerequisites: [], ...over
})

describe('techBuffs aggregation', () => {
  it('multiplies resource mults from COMPLETED techs only', () => {
    const techs = [
      tech({ id: 'a', effects: [{ kind: 'resourceMult', resource: 'research', mult: 1.25 }] }),
      tech({ id: 'b', effects: [{ kind: 'resourceMult', resource: 'research', mult: 1.2 }] }),
      tech({ id: 'c', effects: [{ kind: 'resourceMult', resource: 'energy', mult: 2 }] })
    ]
    const buffs = aggregateTechEffects(techs, ['a', 'b'])
    expect(buffs.resourceMult.research).toBeCloseTo(1.5) // 1.25 * 1.2, stacking
    expect(buffs.resourceMult.energy).toBe(1) // 'c' not completed → neutral
  })

  it('collects ability flags from completed techs', () => {
    const techs = [tech({ id: 'a', effects: [{ kind: 'ability', flag: 'capture:star' }] })]
    expect(aggregateTechEffects(techs, ['a']).abilities.has('capture:star')).toBe(true)
    expect(aggregateTechEffects(techs, []).abilities.size).toBe(0)
  })
})

describe('doctrine lock-out', () => {
  it('locks a doctrine group once one sibling is completed', () => {
    const techs = [
      tech({ id: 'mass', doctrineGroup: 'bootstrap' }),
      tech({ id: 'deep', doctrineGroup: 'bootstrap' }),
      tech({ id: 'other', doctrineGroup: 'strategic' })
    ]
    const locked = lockedDoctrineGroups(techs, ['mass'])
    expect(locked.has('bootstrap')).toBe(true) // sibling 'deep' now unavailable
    expect(locked.has('strategic')).toBe(false)
  })
})

import { TECH_DEFS } from '../defs/research-tree'
import type { TechDef } from '../types/research'

/**
 * Aggregated, completed-research effects for a player: output multipliers (per resource)
 * and the set of unlocked ability/visibility flags. Unlocks of buildings/units live on the
 * defs (`requirements.research`); this is everything else a tech grants — see TechEffect.
 */
export interface TechBuffs {
  resourceMult: { energy: number, minerals: number, research: number, production: number }
  abilities: Set<string>
}

function neutral(): TechBuffs {
  return { resourceMult: { energy: 1, minerals: 1, research: 1, production: 1 }, abilities: new Set() }
}

/** Pure aggregation over an arbitrary tech list — the testable core of `techBuffs`. */
export function aggregateTechEffects(techs: TechDef[], completedTechIds: Iterable<string>): TechBuffs {
  const done = new Set(completedTechIds)
  const buffs = neutral()
  for (const tech of techs) {
    if (!done.has(tech.id) || !tech.effects) continue
    for (const effect of tech.effects) {
      if (effect.kind === 'ability') buffs.abilities.add(effect.flag)
      else if (effect.kind === 'resourceMult') buffs.resourceMult[effect.resource] *= effect.mult
    }
  }
  return buffs
}

/** A player's aggregated tech effects (against the real TECH_DEFS). */
export function techBuffs(completedTechIds: Iterable<string>): TechBuffs {
  return aggregateTechEffects(TECH_DEFS, completedTechIds)
}

/**
 * Doctrine groups the player has already locked in (one sibling completed). Any
 * still-unresearched tech in a locked group is no longer available — the permanent
 * opportunity cost of the hybrid model.
 */
export function lockedDoctrineGroups(techs: TechDef[], completedTechIds: Iterable<string>): Set<string> {
  const done = new Set(completedTechIds)
  const locked = new Set<string>()
  for (const tech of techs) {
    if (tech.doctrineGroup && done.has(tech.id)) locked.add(tech.doctrineGroup)
  }
  return locked
}

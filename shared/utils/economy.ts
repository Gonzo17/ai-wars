import { getBuildingDef } from '../defs/production'
import type { Planet } from '../types/game'

export type ResourceTotals = { energy: number, minerals: number, rare: number }

function forEachCompletedBuilding(
  planets: Planet[],
  playerId: string,
  fn: (def: NonNullable<ReturnType<typeof getBuildingDef>>, level: number) => void
) {
  for (const planet of planets) {
    if (planet.owner !== playerId) continue
    for (const slot of planet.slots) {
      if (!slot.buildingId || slot.isConstructing) continue
      const def = getBuildingDef(slot.buildingId)
      if (def) fn(def, Math.max(1, slot.buildingLevel))
    }
  }
}

/** Per-turn resource production from all completed buildings owned by the player. */
export function calculateResourceProduction(planets: Planet[], playerId: string): ResourceTotals {
  const totals: ResourceTotals = { energy: 0, minerals: 0, rare: 0 }
  forEachCompletedBuilding(planets, playerId, (def, level) => {
    if (!def.resourceProduction) return
    totals.energy += (def.resourceProduction.energy ?? 0) * level
    totals.minerals += (def.resourceProduction.minerals ?? 0) * level
    totals.rare += (def.resourceProduction.rare ?? 0) * level
  })
  return totals
}

/** Per-turn research points from all completed buildings owned by the player. */
export function getResearchPointsPerTurn(planets: Planet[], playerId: string): number {
  let total = 0
  forEachCompletedBuilding(planets, playerId, (def, level) => {
    total += (def.researchPoints ?? 0) * level
  })
  return total
}

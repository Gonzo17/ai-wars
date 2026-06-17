import type { Planet, ResourceId } from '../types/game'
import { getBuildingDef } from '../defs/production'
import { STRATEGIC_RESOURCE_IDS } from '../defs/strategicResources'
import { slotOutput } from './synergies'

export type ResourceTotals = { energy: number, minerals: number, rare: number }

function forEachOwnedPlanet(planets: Planet[], playerId: string, fn: (planet: Planet) => void) {
  for (const planet of planets) {
    if (planet.owner !== playerId) continue
    fn(planet)
  }
}

/** Per-turn resource production from all completed buildings owned by the player (synergies included). */
export function calculateResourceProduction(planets: Planet[], playerId: string): ResourceTotals {
  const totals: ResourceTotals = { energy: 0, minerals: 0, rare: 0 }
  forEachOwnedPlanet(planets, playerId, (planet) => {
    for (let i = 0; i < planet.slots.length; i++) {
      const output = slotOutput(planet, i)
      totals.energy += output.energy
      totals.minerals += output.minerals
      totals.rare += output.rare
    }
  })
  return totals
}

/**
 * Per-turn strategic-resource output: each completed extractor sitting ON its
 * matching deposit yields `amount × level`. Returns a record keyed by ResourceId
 * (zero-filled for every strategic resource).
 */
export function calculateStrategicProduction(planets: Planet[], playerId: string): Record<ResourceId, number> {
  const totals = Object.fromEntries(STRATEGIC_RESOURCE_IDS.map(id => [id, 0])) as Record<ResourceId, number>
  forEachOwnedPlanet(planets, playerId, (planet) => {
    for (const slot of planet.slots) {
      if (!slot.buildingId || slot.isConstructing) continue
      const def = getBuildingDef(slot.buildingId)
      const sp = def?.strategicProduction
      if (!sp || slot.resourceNode !== sp.requiresNode) continue
      totals[sp.resource] = (totals[sp.resource] ?? 0) + sp.amount * Math.max(1, slot.buildingLevel)
    }
  })
  return totals
}

/** Per-turn research points from all completed buildings owned by the player (synergies included). */
export function getResearchPointsPerTurn(planets: Planet[], playerId: string): number {
  let total = 0
  forEachOwnedPlanet(planets, playerId, (planet) => {
    for (let i = 0; i < planet.slots.length; i++) {
      total += slotOutput(planet, i).research
    }
  })
  return total
}

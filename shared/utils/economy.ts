import type { BuildingId, Planet, PlanetId, ResourceId } from '../types/game'
import { BASE_PLANET_PRODUCTION, BASE_PLANET_SCIENCE, getBuildingDef } from '../defs/production'
import { DISTRICT_DEFS } from '../defs/districts'
import { STRATEGIC_RESOURCE_IDS } from '../defs/strategicResources'
import { districtSlotProduction, districtSlotUpkeep, slotOutput } from './synergies'

/**
 * Build throughput a single planet generates per turn: a flat base (workers were
 * removed) plus whatever its Production-district nodes add. The single place the
 * engine reads "how much production does this planet make".
 */
export function planetProductionPerTurn(planet: Planet): number {
  let bonus = 0
  for (let i = 0; i < planet.slots.length; i++) bonus += districtSlotProduction(planet, i)
  return BASE_PLANET_PRODUCTION + bonus
}

/** Total per-turn energy upkeep of all (deeper) district nodes the player runs. */
export function calculateEnergyUpkeep(planets: Planet[], playerId: string): number {
  let upkeep = 0
  forEachOwnedPlanet(planets, playerId, (planet) => {
    for (let i = 0; i < planet.slots.length; i++) upkeep += districtSlotUpkeep(planet, i)
  })
  return upkeep
}

export type ResourceTotals = { energy: number, minerals: number, rare: number }

export type ProductionResourceKind = 'energy' | 'minerals' | 'rare' | 'research'
export type ProductionSource = { buildingId: BuildingId, amount: number }
/** One planet's contribution to a resource: its buildings + the planet subtotal. */
export type ProductionPlanetGroup = { planetId: PlanetId, planetName: string, total: number, sources: ProductionSource[] }

function forEachOwnedPlanet(planets: Planet[], playerId: string, fn: (planet: Planet) => void) {
  for (const planet of planets) {
    if (planet.owner !== playerId) continue
    fn(planet)
  }
}

/**
 * Per-turn resource production for the player (districts + synergies included). Energy
 * is NET: gross production minus the upkeep that deeper district nodes draw. Base nodes
 * are free, so an empty/early planet never goes negative.
 */
export function calculateResourceProduction(planets: Planet[], playerId: string): ResourceTotals {
  const totals: ResourceTotals = { energy: 0, minerals: 0, rare: 0 }
  forEachOwnedPlanet(planets, playerId, (planet) => {
    for (let i = 0; i < planet.slots.length; i++) {
      const output = slotOutput(planet, i)
      totals.energy += output.energy - districtSlotUpkeep(planet, i)
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
const PRODUCTION_KINDS: ProductionResourceKind[] = ['energy', 'minerals', 'rare', 'research']

/**
 * Per-turn production of each base resource, grouped **by planet** then by
 * building (synergies included), so the UI can show "where does this come from?"
 * on hover. Within each planet the buildings are sorted by contribution, and the
 * planet groups themselves are sorted by their subtotal — both descending.
 */
export function resourceProductionBreakdown(
  planets: Planet[],
  playerId: string
): Record<ProductionResourceKind, ProductionPlanetGroup[]> {
  const result: Record<ProductionResourceKind, ProductionPlanetGroup[]> = {
    energy: [], minerals: [], rare: [], research: []
  }
  forEachOwnedPlanet(planets, playerId, (planet) => {
    const perKind: Record<ProductionResourceKind, Map<BuildingId, number>> = {
      energy: new Map(), minerals: new Map(), rare: new Map(), research: new Map()
    }
    for (let i = 0; i < planet.slots.length; i++) {
      const slot = planet.slots[i]
      if (!slot) continue
      const bump = (sourceId: BuildingId, kind: ProductionResourceKind, amount: number) => {
        if (!amount) return
        perKind[kind].set(sourceId, (perKind[kind].get(sourceId) ?? 0) + amount)
      }
      // District slot: attribute each completed node's (weighted) output as its own source.
      if (slot.districtType && slot.nodes?.length) {
        const def = DISTRICT_DEFS[slot.districtType]
        const weight = def.weights?.[planet.type] ?? 1
        for (const nodeId of slot.nodes) {
          const node = def.tree.find(n => n.id === nodeId)
          if (!node?.output) continue
          let minerals = Math.round((node.output.matter ?? 0) * weight)
          if (slot.districtType === 'matter' && slot.resourceNode === 'ore') minerals *= 2
          bump(nodeId, 'energy', Math.round((node.output.energy ?? 0) * weight))
          bump(nodeId, 'minerals', minerals)
          bump(nodeId, 'research', Math.round((node.output.research ?? 0) * weight))
        }
        continue
      }
      // Legacy building / megastructure slot.
      if (!slot.buildingId || slot.isConstructing) continue
      const out = slotOutput(planet, i)
      bump(slot.buildingId, 'energy', out.energy)
      bump(slot.buildingId, 'minerals', out.minerals)
      bump(slot.buildingId, 'rare', out.rare)
      bump(slot.buildingId, 'research', out.research)
    }
    for (const kind of PRODUCTION_KINDS) {
      const map = perKind[kind]
      if (map.size === 0) continue
      const sources = [...map.entries()]
        .map(([buildingId, amount]) => ({ buildingId, amount }))
        .sort((a, b) => b.amount - a.amount)
      const total = sources.reduce((acc, s) => acc + s.amount, 0)
      result[kind].push({ planetId: planet.id, planetName: planet.name, total, sources })
    }
  })
  for (const kind of PRODUCTION_KINDS) {
    result[kind].sort((a, b) => b.total - a.total)
  }
  return result
}

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

/**
 * Per-turn research points for the player: a flat BASE_PLANET_SCIENCE from every owned
 * (non-star) planet — so owning worlds always advances research — plus the research
 * output of all completed buildings (synergies included).
 */
export function getResearchPointsPerTurn(planets: Planet[], playerId: string): number {
  let total = 0
  forEachOwnedPlanet(planets, playerId, (planet) => {
    if (planet.kind !== 'star') total += BASE_PLANET_SCIENCE
    for (let i = 0; i < planet.slots.length; i++) {
      total += slotOutput(planet, i).research
    }
  })
  return total
}

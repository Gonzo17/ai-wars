import type { BuildingId, Planet, PlanetId, ResourceId } from '../types/game'
import { BASE_PLANET_PRODUCTION, BASE_PLANET_SCIENCE, getBuildingDef } from '../defs/production'
import { STRATEGIC_RESOURCE_IDS } from '../defs/strategicResources'
import { slotOutput } from './synergies'

/**
 * Build throughput a single planet generates per turn. Every owned planet has a flat
 * base (workers were removed); the Production district will add on top of this (Phase
 * 2). The single place the engine reads "how much production does this planet make".
 */
export function planetProductionPerTurn(_planet: Planet): number {
  return BASE_PLANET_PRODUCTION
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
      if (!slot?.buildingId || slot.isConstructing) continue
      const buildingId = slot.buildingId
      const out = slotOutput(planet, i)
      const bump = (kind: ProductionResourceKind, amount: number) => {
        if (!amount) return
        perKind[kind].set(buildingId, (perKind[kind].get(buildingId) ?? 0) + amount)
      }
      bump('energy', out.energy)
      bump('minerals', out.minerals)
      bump('rare', out.rare)
      bump('research', out.research)
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

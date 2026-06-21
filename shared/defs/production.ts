import type { BuildingId, ResearchId, ResourceId, ResourceNodeType, UnitId } from '../types/game'

export type Requirement = {
  buildings?: Array<{ id: BuildingId, level: number }>
  research?: ResearchId[]
}

/** Strategic-resource cost/output, keyed by ResourceId (e.g. 'res:exotic-matter'). */
export type StrategicCosts = Partial<Record<ResourceId, number>>

/** A building that mines a strategic resource when placed on its matching deposit. */
export type StrategicProduction = {
  resource: ResourceId
  amount: number
  requiresNode: ResourceNodeType
}

export type ResourceProduction = {
  energy?: number
  minerals?: number
  rare?: number
}

export type BuildingCategory = 'energy' | 'minerals' | 'rare' | 'military' | 'research' | 'infrastructure'
export type UnitCategory = 'support' | 'combat'

export type BuildingDefinition = {
  id: BuildingId
  category: BuildingCategory
  /**
   * Build site. 'star' buildings (megastructures) can ONLY be placed on a
   * captured star; 'planet' (default when absent) only on planets. Capturing
   * the star is therefore the gate to megastructures — see resolveStarCapture.
   */
  site?: 'planet' | 'star'
  resourceCosts: { energy: number, minerals: number, rare: number }
  productionCost: number
  buildTime: number
  requirements: Requirement
  researchPoints?: number
  resourceProduction?: ResourceProduction
  /** Strategic resources consumed (once) to build this. */
  strategicCosts?: StrategicCosts
  /** Strategic resource mined per turn when on the matching deposit. */
  strategicProduction?: StrategicProduction
  maxLevel?: number
  icon?: string
}

/** Build site of a building definition (defaults to 'planet' when unset). */
export const buildingSite = (def: BuildingDefinition): 'planet' | 'star' => def.site ?? 'planet'

export type UnitDefinition = {
  id: UnitId
  category: UnitCategory
  resourceCosts: { energy: number, minerals: number, rare: number }
  productionCost: number
  buildTime: number
  requirements: Requirement
  /** Strategic resources consumed (once) to build this unit. */
  strategicCosts?: StrategicCosts
  unitType: 'battleship' | 'probe' | 'colonizer' | 'star-constructor'
  strength: number
  icon?: string
}

// Max items in a planet's shared production queue (buildings + units, ordered).
// Tunable placeholder — large enough to plan ahead, small enough that the queue
// strip stays readable and energy (paid up-front on enqueue) is the real cap.
export const BUILD_QUEUE_LIMIT = 6

// Every owned planet has a flat BASE production (build throughput) and BASE science
// (research points) even with zero districts — so an undeveloped world always does
// *something*. Throughput above base comes from the Production district; science
// above base from the Research district (Phase 2 district model). Workers are gone.
export const BASE_PLANET_PRODUCTION = 20
// Tuned so a fresh single-planet start researches the cheap first tech in ~3 turns
// (David's "early probe via the first research"); a Research district adds on top.
export const BASE_PLANET_SCIENCE = 20

// Production note: a planet makes BASE_PLANET_PRODUCTION (20) production per turn.
// `productionCost` therefore sets build time in turns (cost / 20). Buildings are
// deliberately multi-turn commitments (~2–6 turns) so placement is a tactical
// choice, not a spam. `buildTime` mirrors that for documentation but is not itself
// read by the engine.
export const BUILDING_DEFS: BuildingDefinition[] = [
  // Energy production buildings
  { id: 'bld:solar-array', category: 'energy', resourceCosts: { energy: 0, minerals: 50, rare: 0 }, productionCost: 60, buildTime: 3, requirements: {}, resourceProduction: { energy: 20 }, maxLevel: 5, icon: 'i-lucide-sun' },
  { id: 'bld:fusion-core', category: 'energy', resourceCosts: { energy: 120, minerals: 80, rare: 10 }, productionCost: 120, buildTime: 6, requirements: { research: ['tech:planetary-grid-management'] }, resourceProduction: { energy: 50 }, maxLevel: 5, icon: 'i-lucide-zap' },
  // Mineral production buildings
  { id: 'bld:mining-facility', category: 'minerals', resourceCosts: { energy: 30, minerals: 0, rare: 0 }, productionCost: 60, buildTime: 3, requirements: {}, resourceProduction: { minerals: 15 }, maxLevel: 5, icon: 'i-lucide-pickaxe' },
  { id: 'bld:refinery-node', category: 'minerals', resourceCosts: { energy: 55, minerals: 85, rare: 6 }, productionCost: 80, buildTime: 4, requirements: { research: ['tech:basic-industrial-robotics'] }, resourceProduction: { minerals: 25 }, maxLevel: 3, icon: 'i-lucide-factory' },
  // Rare element production buildings
  { id: 'bld:rare-extractor', category: 'rare', resourceCosts: { energy: 80, minerals: 100, rare: 0 }, productionCost: 100, buildTime: 5, requirements: { research: ['tech:autonomous-resource-allocation'] }, resourceProduction: { rare: 5 }, maxLevel: 3, icon: 'i-lucide-atom' },
  // Military buildings
  { id: 'bld:orbital-dock', category: 'military', resourceCosts: { energy: 90, minerals: 110, rare: 15 }, productionCost: 80, buildTime: 4, requirements: { research: ['tech:first-shipyard'] }, maxLevel: 3, icon: 'i-lucide-anchor' },
  { id: 'bld:listening-post', category: 'military', resourceCosts: { energy: 45, minerals: 35, rare: 4 }, productionCost: 60, buildTime: 3, requirements: { research: ['tech:deep-system-scan'] }, maxLevel: 2, icon: 'i-lucide-satellite-dish' },
  // Research buildings
  { id: 'bld:data-center', category: 'research', resourceCosts: { energy: 80, minerals: 60, rare: 12 }, productionCost: 120, buildTime: 6, requirements: { research: ['tech:data-center-i'] }, researchPoints: 20, maxLevel: 3, icon: 'i-lucide-flask-conical' },
  // Infrastructure buildings
  { id: 'bld:hydroponics', category: 'infrastructure', resourceCosts: { energy: 60, minerals: 40, rare: 5 }, productionCost: 60, buildTime: 3, requirements: {}, maxLevel: 4, icon: 'i-lucide-leaf' },
  { id: 'bld:hab-complex', category: 'infrastructure', resourceCosts: { energy: 70, minerals: 95, rare: 8 }, productionCost: 100, buildTime: 5, requirements: {}, maxLevel: 4, icon: 'i-lucide-home' },
  { id: 'bld:landing-pad', category: 'infrastructure', resourceCosts: { energy: 40, minerals: 30, rare: 2 }, productionCost: 40, buildTime: 2, requirements: {}, maxLevel: 2, icon: 'i-lucide-plane-landing' },
  // ── Strategic-resource extractors (surface; must sit ON the matching deposit) ──
  { id: 'bld:exotic-extractor', category: 'rare', resourceCosts: { energy: 80, minerals: 120, rare: 10 }, productionCost: 100, buildTime: 5, requirements: { research: ['tech:exotic-matter-survey'] }, strategicProduction: { resource: 'res:exotic-matter', amount: 4, requiresNode: 'exotic-matter' }, maxLevel: 3, icon: 'i-lucide-gem' },
  { id: 'bld:antimatter-collector', category: 'rare', resourceCosts: { energy: 140, minerals: 120, rare: 20 }, productionCost: 120, buildTime: 6, requirements: { research: ['tech:antimatter-containment'] }, strategicProduction: { resource: 'res:antimatter', amount: 3, requiresNode: 'antimatter' }, maxLevel: 3, icon: 'i-lucide-orbit' },
  // ── Megastructures (site: 'star') ────────────────────────────────────
  // Only buildable on a captured star. Balance values are placeholders — the
  // pass happens once the whole stellar loop is in (see Step 2 design). The
  // Dyson sphere is staged via maxLevel (each level = one Dyson stage); a built
  // Dyson stage drives the path to Kardashev K2.0.
  { id: 'bld:dyson-sphere', category: 'energy', site: 'star', resourceCosts: { energy: 0, minerals: 500, rare: 50 }, strategicCosts: { 'res:exotic-matter': 50 }, productionCost: 400, buildTime: 20, requirements: {}, resourceProduction: { energy: 200 }, maxLevel: 5, icon: 'i-lucide-orbit' },
  { id: 'bld:matrioshka-brain', category: 'research', site: 'star', resourceCosts: { energy: 300, minerals: 300, rare: 80 }, productionCost: 400, buildTime: 20, requirements: {}, researchPoints: 60, maxLevel: 3, icon: 'i-lucide-brain-circuit' },
  { id: 'bld:orbital-shipyard-mega', category: 'military', site: 'star', resourceCosts: { energy: 200, minerals: 300, rare: 40 }, productionCost: 300, buildTime: 15, requirements: {}, maxLevel: 1, icon: 'i-lucide-wrench' },
  { id: 'bld:star-fortress', category: 'military', site: 'star', resourceCosts: { energy: 150, minerals: 250, rare: 30 }, productionCost: 250, buildTime: 12, requirements: {}, maxLevel: 3, icon: 'i-lucide-shield' }
]

export const UNIT_DEFS: UnitDefinition[] = [
  // Support units
  { id: 'unit:probe', category: 'support', resourceCosts: { energy: 60, minerals: 50, rare: 8 }, productionCost: 60, buildTime: 1, requirements: { buildings: [{ id: 'bld:orbital-dock', level: 1 }], research: ['tech:probe-design'] }, unitType: 'probe', strength: 1, icon: 'i-lucide-radar' },
  { id: 'unit:colony-ship', category: 'support', resourceCosts: { energy: 100, minerals: 120, rare: 10 }, productionCost: 100, buildTime: 1, requirements: { buildings: [{ id: 'bld:orbital-dock', level: 1 }], research: ['tech:colony-ship-design'] }, unitType: 'colonizer', strength: 1, icon: 'i-lucide-tent' },
  { id: 'unit:star-constructor', category: 'support', resourceCosts: { energy: 200, minerals: 250, rare: 30 }, productionCost: 200, buildTime: 1, requirements: { buildings: [{ id: 'bld:orbital-dock', level: 1 }], research: ['tech:colony-ship-design'] }, unitType: 'star-constructor', strength: 1, icon: 'i-lucide-sun' },
  // Combat units
  { id: 'unit:frigate', category: 'combat', resourceCosts: { energy: 120, minerals: 140, rare: 20 }, productionCost: 120, buildTime: 1, requirements: { buildings: [{ id: 'bld:orbital-dock', level: 1 }], research: ['tech:first-shipyard'] }, unitType: 'battleship', strength: 4, icon: 'i-lucide-ship' },
  // Antimatter capital ship — needs mined antimatter on top of the base cost.
  { id: 'unit:dreadnought', category: 'combat', resourceCosts: { energy: 300, minerals: 400, rare: 60 }, strategicCosts: { 'res:antimatter': 30 }, productionCost: 300, buildTime: 1, requirements: { buildings: [{ id: 'bld:orbital-dock', level: 1 }], research: ['tech:antimatter-containment'] }, unitType: 'battleship', strength: 12, icon: 'i-lucide-rocket' }
]

export const getBuildingDef = (id: BuildingId) => BUILDING_DEFS.find(def => def.id === id)
export const getUnitDef = (id: UnitId) => UNIT_DEFS.find(def => def.id === id)

/** Everything a tech unlocks (buildings/units that list it as a research requirement). */
export function getUnlocksForTech(techId: ResearchId): { buildings: BuildingDefinition[], units: UnitDefinition[] } {
  return {
    buildings: BUILDING_DEFS.filter(def => def.requirements.research?.includes(techId)),
    units: UNIT_DEFS.filter(def => def.requirements.research?.includes(techId))
  }
}

/** All research requirements that are not yet completed for a given definition. */
export function getMissingResearch(requirements: Requirement, completedTechIds: string[]): ResearchId[] {
  return (requirements.research ?? []).filter(id => !completedTechIds.includes(id))
}

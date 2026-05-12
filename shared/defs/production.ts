import type { BuildingId, ResearchId, UnitId } from '../types/game'

export type Requirement = {
  buildings?: Array<{ id: BuildingId, level: number }>
  research?: ResearchId[]
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
  resourceCosts: { energy: number, minerals: number, rare: number }
  productionCost: number
  buildTime: number
  requirements: Requirement
  researchPoints?: number
  resourceProduction?: ResourceProduction
  maxLevel?: number
  icon?: string
}

export type UnitDefinition = {
  id: UnitId
  category: UnitCategory
  resourceCosts: { energy: number, minerals: number, rare: number }
  productionCost: number
  buildTime: number
  requirements: Requirement
  unitType: 'battleship' | 'probe' | 'colonizer'
  strength: number
  icon?: string
}

export const BUILD_QUEUE_LIMIT = 1
export const SHIPYARD_QUEUE_LIMIT = 1
export const PLANET_PRODUCTION_PER_TURN = 20

export const BUILDING_DEFS: BuildingDefinition[] = [
  // Energy production buildings
  { id: 'bld:solar-array', category: 'energy', resourceCosts: { energy: 0, minerals: 50, rare: 0 }, productionCost: 40, buildTime: 1, requirements: {}, resourceProduction: { energy: 20 }, maxLevel: 5, icon: 'i-lucide-sun' },
  { id: 'bld:fusion-core', category: 'energy', resourceCosts: { energy: 120, minerals: 80, rare: 10 }, productionCost: 80, buildTime: 1, requirements: {}, resourceProduction: { energy: 50 }, maxLevel: 5, icon: 'i-lucide-zap' },
  // Mineral production buildings
  { id: 'bld:mining-facility', category: 'minerals', resourceCosts: { energy: 30, minerals: 0, rare: 0 }, productionCost: 40, buildTime: 1, requirements: {}, resourceProduction: { minerals: 15 }, maxLevel: 5, icon: 'i-lucide-pickaxe' },
  { id: 'bld:refinery-node', category: 'minerals', resourceCosts: { energy: 55, minerals: 85, rare: 6 }, productionCost: 50, buildTime: 1, requirements: {}, resourceProduction: { minerals: 25 }, maxLevel: 3, icon: 'i-lucide-factory' },
  // Rare element production buildings
  { id: 'bld:rare-extractor', category: 'rare', resourceCosts: { energy: 80, minerals: 100, rare: 0 }, productionCost: 80, buildTime: 1, requirements: {}, resourceProduction: { rare: 5 }, maxLevel: 3, icon: 'i-lucide-atom' },
  // Military buildings
  { id: 'bld:orbital-dock', category: 'military', resourceCosts: { energy: 90, minerals: 110, rare: 15 }, productionCost: 60, buildTime: 1, requirements: {}, maxLevel: 3, icon: 'i-lucide-anchor' },
  { id: 'bld:listening-post', category: 'military', resourceCosts: { energy: 45, minerals: 35, rare: 4 }, productionCost: 35, buildTime: 1, requirements: {}, maxLevel: 2, icon: 'i-lucide-satellite-dish' },
  // Research buildings
  { id: 'bld:data-center', category: 'research', resourceCosts: { energy: 80, minerals: 60, rare: 12 }, productionCost: 90, buildTime: 1, requirements: {}, researchPoints: 10, maxLevel: 3, icon: 'i-lucide-flask-conical' },
  // Infrastructure buildings
  { id: 'bld:hydroponics', category: 'infrastructure', resourceCosts: { energy: 60, minerals: 40, rare: 5 }, productionCost: 45, buildTime: 1, requirements: {}, maxLevel: 4, icon: 'i-lucide-leaf' },
  { id: 'bld:hab-complex', category: 'infrastructure', resourceCosts: { energy: 70, minerals: 95, rare: 8 }, productionCost: 70, buildTime: 1, requirements: {}, maxLevel: 4, icon: 'i-lucide-home' },
  { id: 'bld:landing-pad', category: 'infrastructure', resourceCosts: { energy: 40, minerals: 30, rare: 2 }, productionCost: 30, buildTime: 1, requirements: {}, maxLevel: 2, icon: 'i-lucide-plane-landing' }
]

export const UNIT_DEFS: UnitDefinition[] = [
  // Support units
  { id: 'unit:worker', category: 'support', resourceCosts: { energy: 20, minerals: 10, rare: 0 }, productionCost: 20, buildTime: 1, requirements: {}, unitType: 'colonizer', strength: 1, icon: 'i-lucide-bot' },
  { id: 'unit:probe', category: 'support', resourceCosts: { energy: 60, minerals: 50, rare: 8 }, productionCost: 60, buildTime: 1, requirements: { buildings: [{ id: 'bld:orbital-dock', level: 1 }] }, unitType: 'probe', strength: 1, icon: 'i-lucide-radar' },
  // Combat units
  { id: 'unit:frigate', category: 'combat', resourceCosts: { energy: 120, minerals: 140, rare: 20 }, productionCost: 120, buildTime: 1, requirements: { buildings: [{ id: 'bld:orbital-dock', level: 1 }] }, unitType: 'battleship', strength: 4, icon: 'i-lucide-ship' }
]

export const getBuildingDef = (id: BuildingId) => BUILDING_DEFS.find(def => def.id === id)
export const getUnitDef = (id: UnitId) => UNIT_DEFS.find(def => def.id === id)

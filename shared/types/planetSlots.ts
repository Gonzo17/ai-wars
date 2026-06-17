import type { BuildingId, PlanetSlotData, ResourceNodeType } from './game'

/** Hex-grid axial coordinates (cube coords where s = -q - r) */
export interface HexCoord {
  q: number
  r: number
}

export interface ResourceNode {
  type: ResourceNodeType
  /** Which slot index this node is placed on */
  slotIndex: number
}

export type SlotState = 'empty' | 'under-construction' | 'completed'

/** Where the slot physically sits */
export type SlotZone = 'surface' | 'orbital'

/** Client-side enriched slot (adds computed fields on top of server PlanetSlotData) */
export interface PlanetSlot {
  index: number
  coord: HexCoord
  state: SlotState
  zone: SlotZone
  buildingId: BuildingId | null
  /** Production progress 0–100 (only meaningful when state = 'under-construction') */
  progress: number
  /** Resource node marker sitting on this slot (if any) */
  resourceNode: ResourceNodeType | null
}

export type AdjacencyBonusType = 'ore-industry'

export interface AdjacencyBonus {
  type: AdjacencyBonusType
  label: string
  /** e.g. -0.05 for −5 % build cost */
  modifier: number
}

export interface PlanetSlotLayout {
  slots: PlanetSlotData[]
  resourceNodes: ResourceNode[]
}

// ── MVP hardcoded hex positions (7 surface slots, honeycomb) ──────────
// Centre slot + 6 surrounding slots
export const SURFACE_SLOT_COORDS: HexCoord[] = [
  { q: 0, r: 0 }, // 0 – centre
  { q: 1, r: 0 }, // 1
  { q: 0, r: 1 }, // 2
  { q: -1, r: 1 }, // 3
  { q: -1, r: 0 }, // 4
  { q: 0, r: -1 }, // 5
  { q: 1, r: -1 } // 6
]

export const SURFACE_SLOT_COUNT = SURFACE_SLOT_COORDS.length

// ── MVP: 5 orbital slots evenly spaced on a ring ─────────────────────
export const ORBITAL_SLOT_COUNT = 5
export const TOTAL_SLOT_COUNT = SURFACE_SLOT_COUNT + ORBITAL_SLOT_COUNT

/** Building IDs that belong in the orbital ring (military + research) */
export const ORBITAL_BUILDING_IDS: BuildingId[] = [
  'bld:orbital-dock' as BuildingId,
  'bld:listening-post' as BuildingId,
  'bld:data-center' as BuildingId
]

/** Everything else is a surface building */
export function isSurfaceBuilding(id: BuildingId): boolean {
  return !ORBITAL_BUILDING_IDS.includes(id)
}

/** Checks whether a building ID is allowed on a given zone */
export function isBuildingAllowedInZone(id: BuildingId, zone: 'surface' | 'orbital'): boolean {
  return zone === 'orbital' ? ORBITAL_BUILDING_IDS.includes(id) : isSurfaceBuilding(id)
}

// ── Star megastructure shells ─────────────────────────────────────────
// A captured star has no surface — megastructures sit in concentric orbital
// shells around it. We model them as plain slots (zone 'orbital' is cosmetic
// here; placement is gated by building `site`, not zone). The innermost shell
// is conventionally the Dyson sphere; the StarSlotView renders accordingly.
export const STAR_SLOT_COUNT = 4

// ── Backward-compat alias ─────────────────────────────────────────────
export const HEX_SLOT_COORDS = SURFACE_SLOT_COORDS

/**
 * Create the default slot layout for a new planet.
 * 7 surface hex slots + 5 orbital ring slots, all empty.
 * `resourceNodes` is a map of surface-slot-index → node type.
 */
export function createPlanetSlots(
  resourceNodes: Map<number, ResourceNodeType> = new Map()
): PlanetSlotData[] {
  const slots: PlanetSlotData[] = []

  // Surface slots
  for (let i = 0; i < SURFACE_SLOT_COUNT; i++) {
    slots.push({
      index: i,
      zone: 'surface',
      buildingId: null,
      buildingLevel: 0,
      isConstructing: false,
      constructionTimeLeft: 0,
      resourceNode: resourceNodes.get(i) ?? null
    })
  }

  // Orbital slots
  for (let i = 0; i < ORBITAL_SLOT_COUNT; i++) {
    slots.push({
      index: SURFACE_SLOT_COUNT + i,
      zone: 'orbital',
      buildingId: null,
      buildingLevel: 0,
      isConstructing: false,
      constructionTimeLeft: 0,
      resourceNode: null
    })
  }

  return slots
}

/**
 * Create the default shell layout for a star: STAR_SLOT_COUNT empty slots.
 * No surface zone, no resource nodes — only megastructures go here.
 */
export function createStarSlots(): PlanetSlotData[] {
  return Array.from({ length: STAR_SLOT_COUNT }, (_, i) => ({
    index: i,
    zone: 'orbital' as const,
    buildingId: null,
    buildingLevel: 0,
    isConstructing: false,
    constructionTimeLeft: 0,
    resourceNode: null
  }))
}

/**
 * Return the indices of all SURFACE slots adjacent to the given slot index
 * (based on cube-coordinate distance = 1).
 */
export function getAdjacentSlotIndices(slotIndex: number, coords: HexCoord[] = SURFACE_SLOT_COORDS): number[] {
  const origin = coords[slotIndex]
  if (!origin) return []
  return coords
    .map((c, i) => ({ i, dist: hexDistance(origin, c) }))
    .filter(({ i, dist }) => i !== slotIndex && dist === 1)
    .map(({ i }) => i)
}

function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  const ds = (-a.q - a.r) - (-b.q - b.r)
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds))
}

/**
 * Check whether placing `buildingId` on `slotIndex` earns adjacency bonuses.
 * MVP: only "Industry buildings adjacent to Ore node → −5 % build cost".
 */
export function computeAdjacencyBonuses(
  slotIndex: number,
  buildingId: BuildingId,
  slots: PlanetSlot[],
  _coords: HexCoord[] = SURFACE_SLOT_COORDS
): AdjacencyBonus[] {
  const bonuses: AdjacencyBonus[] = []

  // Only mineral-category buildings benefit from ore adjacency
  const industryBuildingIds: BuildingId[] = [
    'bld:mining-facility' as BuildingId,
    'bld:refinery-node' as BuildingId
  ]
  if (!industryBuildingIds.includes(buildingId)) return bonuses

  // Check if this slot or any adjacent slot has an ore resource node
  const relevantIndices = [slotIndex, ...getAdjacentSlotIndices(slotIndex, _coords)]
  const hasOre = relevantIndices.some(idx => slots[idx]?.resourceNode === 'ore')

  if (hasOre) {
    bonuses.push({
      type: 'ore-industry',
      label: 'Ore bonus',
      modifier: -0.05 // −5 % build cost
    })
  }

  return bonuses
}

/**
 * Compute the effective production cost for building `buildingId` in `slotIndex`,
 * after applying adjacency bonuses (e.g. ore‑industry −5 %).
 */
export function adjustedProductionCost(
  baseCost: number,
  slotIndex: number,
  buildingId: BuildingId,
  slots: PlanetSlotData[]
): number {
  // Convert PlanetSlotData[] → minimal PlanetSlot[] for computeAdjacencyBonuses
  const asClientSlots: PlanetSlot[] = slots.map((s, i) => ({
    index: s.index,
    coord: i < SURFACE_SLOT_COUNT ? SURFACE_SLOT_COORDS[i]! : { q: 0, r: 0 },
    state: s.buildingId ? (s.isConstructing ? 'under-construction' : 'completed') : 'empty',
    zone: s.zone,
    buildingId: s.buildingId,
    progress: 0,
    resourceNode: s.resourceNode
  }))

  const bonuses = computeAdjacencyBonuses(slotIndex, buildingId, asClientSlots)
  const totalModifier = bonuses.reduce((sum, b) => sum + b.modifier, 0)
  return Math.max(1, Math.round(baseCost * (1 + totalModifier)))
}

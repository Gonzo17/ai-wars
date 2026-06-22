import { getBuildingDef } from '../defs/production'
import { DISTRICT_DEFS } from '../defs/districts'
import { terrainModifier } from '../defs/terrain'
import type { BuildingId, Planet } from '../types/game'
import type { DistrictType } from '../types/districts'
import { getAdjacentSlotIndices } from '../types/planetSlots'

/**
 * Building synergies (roadmap item 4). Three strong, legible interactions that
 * make placement matter without adding micromanagement:
 *
 *  1. ore-extraction  — a mineral building ON an ore node doubles its minerals.
 *  2. power-grid      — an energy building gains +25% energy for each adjacent
 *                       (surface-hex) energy building, rewarding clusters.
 *  3. compute-uplink  — a data center gains +25% research for each completed
 *                       energy building on the same planet (capped at +100%).
 */

const ENERGY_BUILDINGS = new Set<BuildingId>(['bld:solar-array', 'bld:fusion-core'])
const MINERAL_BUILDINGS = new Set<BuildingId>(['bld:mining-facility', 'bld:refinery-node'])
const DATA_CENTER: BuildingId = 'bld:data-center'

const POWER_GRID_PER_NEIGHBOUR = 0.25
const COMPUTE_UPLINK_PER_ENERGY = 0.25
const COMPUTE_UPLINK_MAX_ENERGY = 4

export type SynergyType = 'ore-extraction' | 'power-grid' | 'compute-uplink'

export interface SlotOutput {
  energy: number
  minerals: number
  rare: number
  research: number
}

const ZERO: SlotOutput = { energy: 0, minerals: 0, rare: 0, research: 0 }

function isCompleted(planet: Planet, buildingIds: Set<BuildingId>): (index: number) => boolean {
  return (index: number) => {
    const slot = planet.slots[index]
    return Boolean(slot && slot.buildingId && !slot.isConstructing && buildingIds.has(slot.buildingId))
  }
}

function countCompleted(planet: Planet, buildingIds: Set<BuildingId>): number {
  return planet.slots.filter((_, index) => isCompleted(planet, buildingIds)(index)).length
}

/** Which synergies are active for a (hypothetical or real) building in a slot. */
export function activeSynergies(planet: Planet, slotIndex: number, buildingId: BuildingId): SynergyType[] {
  const slot = planet.slots[slotIndex]
  if (!slot) return []
  const result: SynergyType[] = []

  if (MINERAL_BUILDINGS.has(buildingId) && slot.resourceNode === 'ore') {
    result.push('ore-extraction')
  }
  if (ENERGY_BUILDINGS.has(buildingId)) {
    const adjacent = getAdjacentSlotIndices(slotIndex).filter(isCompleted(planet, ENERGY_BUILDINGS))
    if (adjacent.length > 0) result.push('power-grid')
  }
  if (buildingId === DATA_CENTER && countCompleted(planet, ENERGY_BUILDINGS) > 0) {
    result.push('compute-uplink')
  }

  return result
}

const COMPUTE_UPLINK_PER_ENERGY_DISTRICT = 0.25
const COMPUTE_UPLINK_MAX_ENERGY_DISTRICTS = 4

/** Count completed energy-district nodes across the planet (drives compute-uplink). */
function energyNodeCount(planet: Planet): number {
  let n = 0
  for (const slot of planet.slots) {
    if (slot.districtType === 'energy') n += slot.nodes?.length ?? 0
  }
  return n
}

/**
 * Per-turn output of a DISTRICT slot: the cumulative sum of every completed node in it,
 * scaled by the planet-type weight, with the matter-on-ore resource bonus and the
 * cross-district compute-uplink (research scales with the planet's energy districts).
 */
function districtSlotOutput(planet: Planet, slotIndex: number): SlotOutput {
  const slot = planet.slots[slotIndex]
  if (!slot?.districtType || !slot.nodes?.length) return ZERO
  const def = DISTRICT_DEFS[slot.districtType]
  const weight = def.weights?.[planet.type] ?? 1

  let energy = 0
  let minerals = 0
  let research = 0
  for (const nodeId of slot.nodes) {
    const node = def.tree.find(n => n.id === nodeId)
    if (!node?.output) continue
    energy += node.output.energy ?? 0
    minerals += node.output.matter ?? 0
    research += node.output.research ?? 0
  }

  // Resource-node bonus: a matter district sitting on an ore node doubles its matter.
  if (slot.districtType === 'matter' && slot.resourceNode === 'ore') minerals *= 2
  // Cross-district: research scales with the planet's energy districts (compute uplink).
  if (slot.districtType === 'research' && research > 0) {
    const uplink = Math.min(COMPUTE_UPLINK_MAX_ENERGY_DISTRICTS, energyNodeCount(planet))
    research = research * (1 + COMPUTE_UPLINK_PER_ENERGY_DISTRICT * uplink)
  }

  // Terrain bonus/malus for this district type (the district produces one main resource,
  // so a single multiplier scales the right output).
  const terrain = terrainModifier(slot.terrain, slot.districtType)

  return {
    energy: Math.round(energy * weight * terrain),
    minerals: Math.round(minerals * weight * terrain),
    rare: 0,
    research: Math.round(research * weight * terrain)
  }
}

/**
 * Effective per-turn yield a district node WOULD produce if founded/built in `slotIndex`,
 * including planet-type weight, terrain and synergies — so a placement preview shows the
 * real number (the buffed value), not the raw def output. Computed by reusing the live
 * economy math on a hypothetical planet, so it can never drift from what the engine pays.
 */
export function previewDistrictNodeOutput(
  planet: Planet,
  slotIndex: number,
  districtType: DistrictType,
  nodeId: BuildingId
): SlotOutput & { production: number } {
  const target = planet.slots[slotIndex]
  if (!target) return { ...ZERO, production: 0 }
  const hypothetical: Planet = {
    ...planet,
    slots: planet.slots.map((s, i) =>
      i === slotIndex
        ? { ...s, districtType, nodes: [...(s.nodes ?? []), nodeId], buildingId: null, isConstructing: false }
        : s)
  }
  return { ...slotOutput(hypothetical, slotIndex), production: districtSlotProduction(hypothetical, slotIndex) }
}

/** Per-turn build throughput a district slot adds (Production district nodes). */
export function districtSlotProduction(planet: Planet, slotIndex: number): number {
  const slot = planet.slots[slotIndex]
  if (!slot?.districtType || !slot.nodes?.length) return 0
  const def = DISTRICT_DEFS[slot.districtType]
  let production = 0
  for (const nodeId of slot.nodes) {
    production += def.tree.find(n => n.id === nodeId)?.output?.production ?? 0
  }
  return Math.round(production * terrainModifier(slot.terrain, slot.districtType))
}

/** Effective per-turn output of `slotIndex`: a district's cumulative nodes, else a completed building. */
export function slotOutput(planet: Planet, slotIndex: number): SlotOutput {
  const slot = planet.slots[slotIndex]
  if (slot?.districtType) return districtSlotOutput(planet, slotIndex)
  if (!slot || !slot.buildingId || slot.isConstructing) return ZERO
  const def = getBuildingDef(slot.buildingId)
  if (!def) return ZERO

  const level = Math.max(1, slot.buildingLevel)
  let energy = (def.resourceProduction?.energy ?? 0) * level
  let minerals = (def.resourceProduction?.minerals ?? 0) * level
  const rare = (def.resourceProduction?.rare ?? 0) * level
  let research = (def.researchPoints ?? 0) * level

  // 1. ore-extraction
  if (MINERAL_BUILDINGS.has(slot.buildingId) && slot.resourceNode === 'ore') {
    minerals *= 2
  }
  // 2. power-grid
  if (ENERGY_BUILDINGS.has(slot.buildingId)) {
    const neighbours = getAdjacentSlotIndices(slotIndex).filter(isCompleted(planet, ENERGY_BUILDINGS)).length
    energy = Math.round(energy * (1 + POWER_GRID_PER_NEIGHBOUR * neighbours))
  }
  // 3. compute-uplink
  if (slot.buildingId === DATA_CENTER) {
    const energyCount = Math.min(COMPUTE_UPLINK_MAX_ENERGY, countCompleted(planet, ENERGY_BUILDINGS))
    research = Math.round(research * (1 + COMPUTE_UPLINK_PER_ENERGY * energyCount))
  }

  return { energy, minerals, rare, research }
}

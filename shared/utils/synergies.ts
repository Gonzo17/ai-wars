import { getBuildingDef } from '../defs/production'
import type { BuildingId, Planet } from '../types/game'
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

/** Effective per-turn output of the completed building in `slotIndex`, with synergies applied. */
export function slotOutput(planet: Planet, slotIndex: number): SlotOutput {
  const slot = planet.slots[slotIndex]
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

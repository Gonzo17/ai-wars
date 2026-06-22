import type { BuildingId, Planet } from '../types/game'
import type { DistrictType, NodeCost, NodeOutput, SlotZonePlacement } from '../types/districts'
import { DISTRICT_DEFS, districtsForPlanetType } from '../defs/districts'

/**
 * A district node the player could queue right now on a planet, with the slot(s) it
 * may target. Mirrors the engine's validation rules (planet-type availability, zone,
 * within-district prereqs, exclusive branchGroups, "one district per type per planet",
 * research gating) so the client catalog and the server agree on what's buildable.
 */
export interface BuildableNode {
  nodeId: BuildingId
  districtType: DistrictType
  cost: NodeCost
  buildTime: number
  energyUpkeep: number
  output: NodeOutput
  /** Slot indices this node may be placed into (empty slots for a base, the district's slot for deeper nodes). */
  validSlots: number[]
  /** True when a required tech is not yet completed (shown but greyed in the catalog). */
  locked: boolean
  /** True when this node FOUNDS a new district (the catalog labels it by district). */
  isBase: boolean
}

/**
 * A research district is "established" once any owned planet has a completed Research
 * district (its data-center base node, which houses the AI core). Until then every
 * other district is gated — so the first build of the game is always the data center.
 */
export function hasResearchDistrict(planets: Planet[]): boolean {
  return planets.some(p =>
    p.kind !== 'star'
    && p.slots.some(s => s.districtType === 'research' && (s.nodes?.length ?? 0) > 0))
}

function emptySlotsForZone(planet: Planet, zone: SlotZonePlacement): number[] {
  const out: number[] = []
  planet.slots.forEach((slot, i) => {
    const empty = !slot.buildingId && !slot.districtType && !(slot.nodes?.length)
    if (empty && (zone === 'any' || slot.zone === zone)) out.push(i)
  })
  return out
}

/** Nodes already built or in-progress in a district slot (the chosen path so far). */
function chosenNodes(planet: Planet, slotIndex: number): BuildingId[] {
  const slot = planet.slots[slotIndex]
  if (!slot) return []
  const inProgress = slot.isConstructing && slot.buildingId ? [slot.buildingId] : []
  return [...(slot.nodes ?? []), ...inProgress]
}

/**
 * Compute every district node the player can queue on `planet` right now. Each district
 * type appears at most once: if the planet has no slot of that type yet, its base node
 * is offered (targeting empty slots of the right zone); otherwise the next buildable
 * nodes in that district's tree are offered (targeting the existing district slot).
 */
export function buildableDistrictNodes(
  planet: Planet,
  completedTechIds: string[],
  researchEstablished = true
): BuildableNode[] {
  const result: BuildableNode[] = []
  const completed = new Set(completedTechIds)

  for (const def of districtsForPlanetType(planet.type)) {
    // The data center (Research district) houses the AI core and must come first:
    // until a Research district exists, no other district can be founded.
    if (!researchEstablished && def.type !== 'research') continue

    const existingIndex = planet.slots.findIndex(s => s.districtType === def.type)

    for (const node of def.tree) {
      const isBase = node.prereqIds.length === 0
      let validSlots: number[] = []

      if (existingIndex < 0) {
        // No district of this type yet — only the base node can open one.
        if (!isBase) continue
        validSlots = emptySlotsForZone(planet, def.zone)
      } else {
        const built = chosenNodes(planet, existingIndex)
        if (built.includes(node.id)) continue // already built / in progress
        if (!node.prereqIds.every(p => built.includes(p))) continue // prereqs missing
        if (node.branchGroup) {
          const conflict = def.tree.some(n => n.branchGroup === node.branchGroup && n.id !== node.id && built.includes(n.id))
          if (conflict) continue // a sibling branch was already chosen
        }
        validSlots = [existingIndex]
      }

      if (validSlots.length === 0) continue
      result.push({
        nodeId: node.id,
        districtType: def.type,
        cost: node.cost,
        buildTime: node.buildTime,
        energyUpkeep: node.energyUpkeep ?? 0,
        output: node.output ?? {},
        validSlots,
        locked: Boolean(node.research && !completed.has(node.research)),
        isBase
      })
    }
  }
  return result
}

/** The district type a slot currently hosts (for rendering), or null. */
export function slotDistrictType(planet: Planet, slotIndex: number): DistrictType | null {
  return planet.slots[slotIndex]?.districtType ?? null
}

/** Icon hint per district type (lucide names) for the client. */
export const DISTRICT_ICONS: Record<DistrictType, string> = {
  energy: 'i-lucide-zap',
  matter: 'i-lucide-pickaxe',
  rare: 'i-lucide-atom',
  exotic: 'i-lucide-gem',
  antimatter: 'i-lucide-orbit',
  research: 'i-lucide-flask-conical',
  production: 'i-lucide-factory',
  shipyard: 'i-lucide-rocket',
  defense: 'i-lucide-shield'
}

export { DISTRICT_DEFS }

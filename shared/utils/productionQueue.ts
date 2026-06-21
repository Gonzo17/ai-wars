import type { BuildingId, Planet, ProductionQueueItem, UnitId } from '../types/game'
import type { ProductionQueueCommandItem } from '../types/turn'
import { getBuildingDef, getUnitDef } from '../defs/production'
import { findDistrictNode } from '../defs/districts'

export type ItemCost = { energy: number, minerals: number, rare: number, strategic: Record<string, number> }

const ZERO_COST = (): ItemCost => ({ energy: 0, minerals: 0, rare: 0, strategic: {} })

/** Copy a strategic-cost record dropping undefined/zero entries (keeps a clean number map). */
function cleanStrategic(costs?: Partial<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, amount] of Object.entries(costs ?? {})) {
    if (amount) out[key] = amount
  }
  return out
}

/**
 * Per-item resource cost for a desired queue, aligned to `items`. Only items flagged
 * `isNew` cost anything (resumes were paid when first added). Used by validation, the
 * resolveTurn deduction loop, and the client's optimistic cost preview, so all three
 * agree. `planet` is currently unused but kept for future per-planet cost modifiers
 * (e.g. the Production/Matter district lowering build cost).
 */
export function queueItemCosts(_planet: Planet, items: ProductionQueueCommandItem[], isNew: boolean[]): ItemCost[] {
  return items.map((item, i) => {
    if (!isNew[i]) return ZERO_COST()
    if (item.kind === 'building') {
      // District node: cost is on the node def (matter maps to the minerals stockpile).
      const district = findDistrictNode(item.buildingId)
      if (district) {
        const c = district.node.cost
        return { energy: c.energy ?? 0, minerals: c.matter ?? 0, rare: 0, strategic: cleanStrategic(c.strategic) }
      }
      const def = getBuildingDef(item.buildingId)
      if (!def) return ZERO_COST()
      return { ...def.resourceCosts, strategic: cleanStrategic(def.strategicCosts) }
    }
    const def = getUnitDef(item.unitId)
    if (!def) return ZERO_COST()
    return { ...def.resourceCosts, strategic: cleanStrategic(def.strategicCosts) }
  })
}

export type QueueReconciliation = {
  /** The reconciled queue, with unit progress carried over from the previous queue. */
  queue: ProductionQueueItem[]
  /** Per input item (same order): true if it is newly added this turn and must be charged. */
  isNew: boolean[]
  /** Building items new this turn (slot not already constructing them) → charge once. */
  newBuildings: Array<{ slotIndex: number, buildingId: BuildingId }>
  /** Unit items new this turn (no in-progress match) → charge once. */
  newUnits: Array<{ unitId: UnitId }>
}

/**
 * Pure: given a planet's *current* (pre-mutation) state and the desired queue items,
 * compute the reconciled production queue and which items are newly added this turn.
 *
 * Building progress lives on the slot (`constructionTimeLeft`); unit progress is carried
 * over by matching each desired unit to a not-yet-consumed unit of the same id in the
 * old queue (greedy, order-preserving — so a reordered item keeps its progress instead
 * of the queue *position* keeping it). Items with no match are "new" and charged once.
 *
 * The resolveTurn deduction loop, applyPlan, and validateTurnPlan all call this on the
 * same pre-state, so "new vs resume" (and therefore what gets charged) always agrees.
 */
export function reconcileProductionQueue(planet: Planet, items: ProductionQueueCommandItem[]): QueueReconciliation {
  const oldUnits = (planet.queues?.production ?? [])
    .filter((i): i is Extract<ProductionQueueItem, { kind: 'unit' }> => i.kind === 'unit')
    .map(i => ({ unitId: i.unitId, productionSpent: i.productionSpent, consumed: false }))

  const queue: ProductionQueueItem[] = []
  const isNew: boolean[] = []
  const newBuildings: Array<{ slotIndex: number, buildingId: BuildingId }> = []
  const newUnits: Array<{ unitId: UnitId }> = []

  for (const item of items) {
    if (item.kind === 'building') {
      const slot = planet.slots[item.slotIndex]
      const isResume = Boolean(slot) && slot!.buildingId === item.buildingId && slot!.isConstructing
      isNew.push(!isResume)
      if (!isResume) newBuildings.push({ slotIndex: item.slotIndex, buildingId: item.buildingId })
      queue.push({ kind: 'building', slotIndex: item.slotIndex, buildingId: item.buildingId })
    } else {
      const match = oldUnits.find(u => !u.consumed && u.unitId === item.unitId)
      if (match) {
        match.consumed = true
        isNew.push(false)
        queue.push({ kind: 'unit', unitId: item.unitId, productionSpent: match.productionSpent })
      } else {
        isNew.push(true)
        newUnits.push({ unitId: item.unitId })
        queue.push({ kind: 'unit', unitId: item.unitId, productionSpent: 0 })
      }
    }
  }

  return { queue, isNew, newBuildings, newUnits }
}

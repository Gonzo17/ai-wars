import { BASE_PLANET_PRODUCTION, getBuildingDef } from '~~/shared/defs/production'
import { findDistrictNode } from '~~/shared/defs/districts'
import type { GameSnapshot, Planet, PlayerSnapshot, ProductionQueueItem, Unit } from '~~/shared/types/game'
import { adjustedProductionCost } from '~~/shared/types/planetSlots'
import type { TurnPlan } from '~~/shared/types/turn'
import { reconcileProductionQueue } from '~~/shared/utils/productionQueue'
import { findLanePath, getSystemIdForLocation } from '~~/shared/utils/starlanes'

/**
 * Apply one player's plan to a fresh clone of the snapshot: set each named planet's
 * production queue, (re)start research, and set fleet destinations. Resource costs for
 * NEW queue items are deducted by the orchestrator BEFORE this runs (see resolveTurn);
 * resumed/in-progress items are not re-charged.
 */
export function applyPlan(snapshot: GameSnapshot, player: PlayerSnapshot, plan: TurnPlan): GameSnapshot {
  const next = structuredClone(snapshot)
  const targetPlayer = next.players.find((p: PlayerSnapshot) => p.id === player.id)
  if (!targetPlayer) return next
  if (!targetPlayer.research.progressMemory) {
    targetPlayer.research.progressMemory = {}
  }

  for (const command of plan.commands) {
    if (command.type === 'startResearch') {
      if (targetPlayer.research.activeResearch && targetPlayer.research.activeResearch.techId !== command.researchId) {
        const previous = targetPlayer.research.activeResearch
        targetPlayer.research.progressMemory[previous.techId] = previous.progressPoints
      }
      if (!targetPlayer.research.activeResearch || targetPlayer.research.activeResearch.techId !== command.researchId) {
        const stored = targetPlayer.research.progressMemory[command.researchId] ?? 0
        targetPlayer.research.activeResearch = {
          techId: command.researchId,
          startedAt: Date.now(),
          progressPoints: stored
        }
        targetPlayer.availableResearchIds = targetPlayer.availableResearchIds.filter((id: string) => id !== command.researchId)
      }
      continue
    }

    if (command.type === 'setProductionQueue') {
      const planet = next.planets.find((p: Planet) => p.id === command.planetId)
      if (!planet) continue
      const { queue } = reconcileProductionQueue(planet, command.items)
      const referencedSlots = new Set(
        queue.filter((i): i is Extract<ProductionQueueItem, { kind: 'building' }> => i.kind === 'building').map(i => i.slotIndex)
      )

      // Cancel: a slot still under construction but no longer referenced by any queued
      // building was removed by the player — free the in-progress build (progress +
      // already-paid resources are forfeited, matching "cancel loses it"). Completed
      // district nodes stay; a district with nothing built reverts to an empty slot.
      planet.slots.forEach((slot, idx) => {
        if (slot.isConstructing && !referencedSlots.has(idx)) {
          slot.buildingId = null
          slot.buildingLevel = 0
          slot.isConstructing = false
          slot.constructionTimeLeft = 0
          if (slot.districtType && !slot.nodes?.length) slot.districtType = null
        }
      })

      // Start construction for newly-queued buildings (resumed ones keep their progress).
      for (const item of queue) {
        if (item.kind !== 'building') continue
        const slot = planet.slots[item.slotIndex]
        if (!slot) continue
        const isResume = slot.buildingId === item.buildingId && slot.isConstructing
        if (isResume) continue

        const districtNode = findDistrictNode(item.buildingId)
        if (districtNode) {
          // District node: opening the district sets the slot's type; build time is
          // buildTime turns at the planet's base production rate.
          slot.districtType = districtNode.district.type
          slot.buildingId = item.buildingId
          slot.buildingLevel = 1
          slot.isConstructing = true
          slot.constructionTimeLeft = districtNode.node.buildTime * BASE_PLANET_PRODUCTION
          continue
        }

        // Legacy building / megastructure (stars).
        const def = getBuildingDef(item.buildingId)
        if (!def) continue
        slot.buildingId = item.buildingId
        slot.buildingLevel = 1
        slot.isConstructing = true
        slot.constructionTimeLeft = adjustedProductionCost(def.productionCost, item.slotIndex, item.buildingId, planet.slots)
      }

      planet.queues.production = queue
      continue
    }

    if (command.type === 'moveFleet') {
      const fleet = next.fleets.find((f: Unit) => f.id === command.fleetId)
      if (!fleet) continue
      const fromSystemId = getSystemIdForLocation(next, fleet.location)
      const path = fromSystemId ? findLanePath(next.systems, fromSystemId, command.toSystemId) : null
      const updated: Unit = {
        ...fleet,
        status: 'en-route',
        destination: command.toSystemId,
        eta: path?.length
      }
      next.fleets = next.fleets.map((f: Unit) => (f.id === updated.id ? updated : f))
    }
  }

  return next
}

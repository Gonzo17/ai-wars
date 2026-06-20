import { getBuildingDef, getUnitDef } from '~~/shared/defs/production'
import type { GameSnapshot, Planet, PlayerSnapshot, Unit } from '~~/shared/types/game'
import { adjustedProductionCost } from '~~/shared/types/planetSlots'
import type { TurnPlan } from '~~/shared/types/turn'
import { findLanePath, getSystemIdForLocation } from '~~/shared/utils/starlanes'

/**
 * Apply one player's plan to a fresh clone of the snapshot: queue builds/units,
 * (re)start research, and set fleet destinations. Resource costs for NEW builds
 * are deducted by the orchestrator BEFORE this runs (see resolveTurn). Resuming
 * an in-progress build keeps its progress and is not re-charged.
 */
export function applyPlan(snapshot: GameSnapshot, player: PlayerSnapshot, plan: TurnPlan): GameSnapshot {
  const next = structuredClone(snapshot)
  const targetPlayer = next.players.find((p: PlayerSnapshot) => p.id === player.id)
  if (!targetPlayer) return next
  if (!targetPlayer.research.progressMemory) {
    targetPlayer.research.progressMemory = {}
  }

  /**
   * Remember current shipyard queue progress before it gets replaced.
   * Building progress lives in the slot itself, so nothing to save for buildings.
   */
  const rememberUnitQueueProgress = (planet: Planet) => {
    if (!planet.progressMemory) planet.progressMemory = {}
    const currentUnit = planet.queues.shipyard[0]
    if (currentUnit) {
      const def = getUnitDef(currentUnit.id)
      const productionCost = def?.productionCost ?? 0
      const remaining = currentUnit.eta ?? productionCost
      const spent = Math.max(0, productionCost - remaining)
      planet.progressMemory[currentUnit.id] = { productionSpent: spent, resourcePaid: true }
    }
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

    if (command.type === 'buildStructure') {
      const planet = next.planets.find((p: Planet) => p.id === command.planetId)
      if (!planet) continue
      const def = getBuildingDef(command.buildingId)
      if (!def) continue
      const slot = planet.slots[command.slotIndex]
      if (!slot) continue

      // If resuming (same building already assigned to this slot), keep progress
      const isResume = slot.buildingId === command.buildingId && slot.isConstructing

      if (!isResume) {
        const cost = adjustedProductionCost(def.productionCost, command.slotIndex, command.buildingId, planet.slots)
        slot.buildingId = command.buildingId
        slot.buildingLevel = 1
        slot.isConstructing = true
        slot.constructionTimeLeft = cost
      }

      // Save unit progress before clearing shipyard queue
      rememberUnitQueueProgress(planet)

      planet.queues.build = [{ slotIndex: command.slotIndex }]
      planet.queues.shipyard = []
      continue
    }

    if (command.type === 'buildUnit') {
      const planet = next.planets.find((p: Planet) => p.id === command.planetId)
      if (!planet) continue
      const def = getUnitDef(command.unitId)
      if (!def) continue
      rememberUnitQueueProgress(planet)
      const stored = planet.progressMemory?.[command.unitId]
      const storedSpent = stored?.productionSpent ?? 0
      const remaining = Math.max(0, def.productionCost - storedSpent)
      const unit: Unit = {
        id: command.unitId,
        type: def.unitType,
        name: command.unitId,
        status: 'idle',
        location: planet.id,
        eta: remaining,
        strength: def.strength,
        ownerId: player.id
      }
      planet.queues.shipyard = [unit]
      planet.queues.build = []
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

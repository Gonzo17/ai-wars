import { initialState } from './initialState'
import { toPlayerId } from './playerId'
import type { GameRepository } from './repository'
import { applyPlan } from './resolve/applyPlan'
import { createEventIdFactory } from './resolve/events'
import { advanceFleets, resolveColonization, resolveCombat, resolveStarCapture } from './resolve/fleets'
import { advanceQueues, updatePlanetsControlled } from './resolve/queues'
import { advanceResearch } from './resolve/research'
import { resolveVictory } from './resolve/victory'
import {
  applyResourceProduction,
  applyStrategicProduction,
  deductResourceCosts,
  deductStrategicCosts,
  updateResourceDeltas
} from './resolve/resources'
import { getBuildingDef, getUnitBuildCost, getUnitDef } from '~~/shared/defs/production'
import type { GameSnapshot, Planet, PlayerSnapshot } from '~~/shared/types/game'
import type { TurnPlan } from '~~/shared/types/turn'
import { calculateResourceProduction, calculateStrategicProduction } from '~~/shared/utils/economy'

type ResolveResult = {
  resolved: boolean
  reason?: 'lock' | 'not-ready'
}

export async function resolveTurn(repo: GameRepository, gameId: string, turn: number): Promise<ResolveResult> {
  const lock = await repo.tryAcquireResolveLock(gameId, turn)

  if (!lock) {
    return { resolved: false, reason: 'lock' }
  }

  // From here on the game is in phase `resolving`. Any thrown error must
  // release the lock, otherwise the game is stuck in `resolving` forever.
  try {
    const playerIds = await repo.listGamePlayers(gameId)
    let snapshot = await repo.getGameState(gameId, turn)
    if (!snapshot) {
      snapshot = initialState(playerIds, turn)
      await repo.insertGameState(gameId, turn, snapshot)
    }

    const plans = await repo.listSubmittedPlans(gameId, turn)

    if ((plans ?? []).length !== playerIds.length) {
      await repo.releaseResolveLock(gameId)
      return { resolved: false, reason: 'not-ready' }
    }

    const sortedPlans = (plans ?? []).slice().sort((a, b) => a.user_id.localeCompare(b.user_id))
    let nextSnapshot: GameSnapshot = snapshot

    // Step 1: Apply plans (queue builds) and deduct resource costs for new builds
    for (const planRow of sortedPlans) {
      const plan = planRow.plan_json as TurnPlan
      const playerId = toPlayerId(planRow.user_id)
      const player = nextSnapshot.players.find((p: PlayerSnapshot) => p.id === playerId)
      if (!player) continue

      // Deduct costs for new builds before applying the plan
      for (const command of plan.commands) {
        if (command.type === 'buildStructure') {
          const planet = nextSnapshot.planets.find((p: Planet) => p.id === command.planetId)
          if (!planet) continue
          const def = getBuildingDef(command.buildingId)
          if (!def) continue
          // Only charge if this is a new build (slot doesn't already have this building under construction)
          const slot = planet.slots[command.slotIndex]
          const isResume = slot && slot.buildingId === command.buildingId && slot.isConstructing
          if (!isResume) {
            deductResourceCosts(player, def.resourceCosts)
            deductStrategicCosts(player, def.strategicCosts)
          }
        }
        if (command.type === 'buildUnit') {
          const planet = nextSnapshot.planets.find((p: Planet) => p.id === command.planetId)
          if (!planet) continue
          const def = getUnitDef(command.unitId)
          if (!def) continue
          // Only charge if this is a new build (not continuing an existing one)
          const inShipyard = planet.queues.shipyard.some(u => u.id === command.unitId)
          const memory = planet.progressMemory?.[command.unitId]
          if (!inShipyard && !memory?.resourcePaid) {
            deductResourceCosts(player, getUnitBuildCost(def, planet.workers))
            deductStrategicCosts(player, def.strategicCosts)
          }
        }
      }

      nextSnapshot = applyPlan(nextSnapshot, player, plan)
    }

    const nextEventId = createEventIdFactory(turn)

    // Step 2: Move fleets one star lane along their routes
    advanceFleets(nextSnapshot, turn, nextEventId)

    // Step 3: Resolve combat where fleets meet, then colonize undefended planets
    resolveCombat(nextSnapshot, turn, nextEventId)
    resolveColonization(nextSnapshot, turn, nextEventId)
    resolveStarCapture(nextSnapshot, turn, nextEventId)

    // Step 4: Add resource production from existing buildings (before completing new ones)
    for (const player of nextSnapshot.players) {
      const production = calculateResourceProduction(nextSnapshot.planets, player.id)
      applyResourceProduction(player, production)
      applyStrategicProduction(player, calculateStrategicProduction(nextSnapshot.planets, player.id))
    }

    // Step 5: Advance research and complete buildings/units
    advanceResearch(nextSnapshot, turn, nextEventId)
    advanceQueues(nextSnapshot, turn, nextEventId)

    // Empire counts reflect the post-resolution state (ownership + completed
    // megastructures), so this runs after capture/colonization AND queue completion.
    updatePlanetsControlled(nextSnapshot)

    // Step 6: Evaluate victory conditions on the final state. The new snapshot
    // represents turn + 1, so that is the "current turn" for countdown bookkeeping.
    const victoryResult = resolveVictory(nextSnapshot, turn + 1, nextEventId)

    // Step 7: Update resource deltas for display (production for next turn)
    updateResourceDeltas(nextSnapshot)

    nextSnapshot = { ...nextSnapshot, turn: turn + 1 }

    await repo.insertGameState(gameId, turn + 1, nextSnapshot)
    await repo.updateGameTurn(gameId, turn + 1)

    // A decided game stops accepting turns (submitTurn rejects `finished`).
    if (victoryResult.winnerId) {
      await repo.updateGameStatus(gameId, 'finished')
    }

    return { resolved: true }
  } catch (error) {
    await repo.releaseResolveLock(gameId)
    throw error
  }
}

import { initialState } from './initialState'
import { toPlayerId } from './playerId'
import type { GameRepository } from './repository'
import { TECH_DEFS } from '~~/shared/defs/research-tree'
import { getBuildingDef, getUnitDef } from '~~/shared/defs/production'
import type { GameEvent } from '~~/shared/types/events'
import type { BuildingId, PlanetId, PlayerId, ResearchId, Resource, Unit, UnitId } from '~~/shared/types/game'
import { adjustedProductionCost } from '~~/shared/types/planetSlots'
import { calculateResourceProduction, getResearchPointsPerTurn } from '~~/shared/utils/economy'

type ResolveResult = {
  resolved: boolean
  reason?: 'lock' | 'not-ready'
}

type ResourceCosts = { energy: number, minerals: number, rare: number }

function getPlayerResource(player: PlayerSnapshot, key: string): Resource | undefined {
  return player.resources.find(r => r.key === key)
}

function modifyResource(player: PlayerSnapshot, key: string, delta: number) {
  const resource = getPlayerResource(player, key)
  if (resource) {
    resource.current = Math.max(0, Math.min(resource.max, resource.current + delta))
  }
}

function deductResourceCosts(player: PlayerSnapshot, costs: ResourceCosts) {
  modifyResource(player, 'res:energy', -costs.energy)
  modifyResource(player, 'res:material', -costs.minerals)
  modifyResource(player, 'res:rare', -costs.rare)
}

function applyResourceProduction(player: PlayerSnapshot, production: ResourceCosts) {
  modifyResource(player, 'res:energy', production.energy)
  modifyResource(player, 'res:material', production.minerals)
  modifyResource(player, 'res:rare', production.rare)
}

function updateResourceDeltas(snapshot: GameSnapshot) {
  for (const player of snapshot.players) {
    const production = calculateResourceProduction(snapshot.planets, player.id)
    const energyRes = getPlayerResource(player, 'res:energy')
    const mineralRes = getPlayerResource(player, 'res:material')
    const rareRes = getPlayerResource(player, 'res:rare')
    if (energyRes) energyRes.delta = production.energy
    if (mineralRes) mineralRes.delta = production.minerals
    if (rareRes) rareRes.delta = production.rare
  }
}

function applyPlan(snapshot: GameSnapshot, player: PlayerSnapshot, plan: TurnPlan): GameSnapshot {
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
      const updated: Unit = {
        ...fleet,
        status: 'en-route',
        destination: command.toSystemId
      }
      next.fleets = next.fleets.map((f: Unit) => (f.id === updated.id ? updated : f))
    }
  }

  return next
}

function updateAvailableResearch(player: PlayerSnapshot) {
  const completed = new Set(player.research.completedTechIds)
  const activeId = player.research.activeResearch?.techId
  player.availableResearchIds = TECH_DEFS
    .filter(tech => !completed.has(tech.id) && tech.prerequisites.every(id => completed.has(id)))
    .map(tech => tech.id as ResearchId)
    .filter(id => id !== activeId)
}

const buildingNameKey = (buildingId: BuildingId) => `game.buildings.${buildingId.replace('bld:', '')}.name`
const unitNameKey = (unitId: UnitId) => `game.units.${unitId.replace('unit:', '')}.name`
const techNameKey = (techId: ResearchId) => `game.research.techs.${techId.replace('tech:', '')}.name`

function getPlanetName(snapshot: GameSnapshot, planetId: PlanetId): string {
  const planet = snapshot.planets.find(p => p.id === planetId)
  return planet?.name ?? planetId
}

function addEvent(snapshot: GameSnapshot, playerId: PlayerId, event: GameEvent) {
  const player = snapshot.players.find(p => p.id === playerId)
  if (!player) return
  player.events = [...(player.events ?? []), event]
}

function advanceResearch(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  for (const player of snapshot.players) {
    const active = player.research.activeResearch
    if (!active) {
      updateAvailableResearch(player)
      continue
    }
    const tech = TECH_DEFS.find(t => t.id === active.techId)
    if (!tech) continue
    const requiredPoints = tech.researchPoints ?? 0
    const increment = getResearchPointsPerTurn(snapshot.planets, player.id)
    active.progressPoints = Math.min(requiredPoints, active.progressPoints + increment)
    if (active.progressPoints >= requiredPoints) {
      player.research.completedTechIds.push(active.techId)
      player.research.activeResearch = undefined
      player.research.progressMemory = Object.fromEntries(
        Object.entries(player.research.progressMemory).filter(([key]) => key !== active.techId)
      )
      const locationId = player.planets[0]
      addEvent(snapshot, player.id, {
        id: nextEventId(),
        type: 'research-complete',
        severity: 'success',
        year: turn,
        titleKey: 'events.types.research-complete.title',
        titleParams: { name: techNameKey(active.techId as ResearchId) },
        descriptionKey: 'events.types.research-complete.description',
        descriptionParams: { location: locationId ? getPlanetName(snapshot, locationId) : 'Unknown' },
        details: [
          {
            labelKey: 'events.details.research-points',
            value: String(requiredPoints),
            icon: 'i-lucide-flask'
          }
        ],
        relatedEntityId: active.techId,
        relatedEntityType: 'research',
        read: false,
        timestamp: Date.now()
      })
    }
    updateAvailableResearch(player)
  }
}

function advanceQueues(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  for (const planet of snapshot.planets) {
    if (planet.queues.build.length > 0) {
      planet.queues.build = planet.queues.build.slice(0, 1)
      planet.queues.shipyard = []
    } else if (planet.queues.shipyard.length > 0) {
      planet.queues.shipyard = planet.queues.shipyard.slice(0, 1)
    }

    if (!planet.progressMemory) {
      planet.progressMemory = {}
    }

    const available = (planet.workers * planet.productionPerWorker) + (planet.productionCarryover ?? 0)
    planet.productionCarryover = 0

    // ── Building queue (slot-based) ──────────────────────────────────
    const buildQueue = planet.queues.build
    if (buildQueue.length > 0) {
      const entry = buildQueue[0]!
      const slot = planet.slots[entry.slotIndex]
      if (!slot || !slot.buildingId || !slot.isConstructing) {
        // Invalid queue entry — clear it
        planet.queues.build = []
        continue
      }
      const def = getBuildingDef(slot.buildingId)
      const remaining = Math.max(0, slot.constructionTimeLeft - available)
      const overflow = available - slot.constructionTimeLeft
      slot.constructionTimeLeft = remaining

      if (remaining <= 0) {
        slot.isConstructing = false
        slot.constructionTimeLeft = 0

        if (planet.owner !== 'unclaimed' && planet.owner !== 'unknown') {
          addEvent(snapshot, planet.owner, {
            id: nextEventId(),
            type: 'building-complete',
            severity: 'success',
            year: turn,
            titleKey: 'events.types.building-complete.title',
            titleParams: { name: buildingNameKey(slot.buildingId) },
            descriptionKey: 'events.types.building-complete.description',
            descriptionParams: { location: getPlanetName(snapshot, planet.id) },
            details: [
              { labelKey: 'events.details.energy-used', value: String(def?.resourceCosts.energy ?? 0), icon: 'i-lucide-zap' },
              { labelKey: 'events.details.materials-used', value: String(def?.resourceCosts.minerals ?? 0), icon: 'i-lucide-wrench' }
            ],
            relatedEntityId: planet.id,
            relatedEntityType: 'planet',
            read: false,
            timestamp: Date.now()
          })
        }
        planet.queues.build = buildQueue.slice(1)
        if (overflow > 0) {
          planet.productionCarryover = overflow
        }
      }
      continue
    }

    // ── Shipyard queue (unit-based, unchanged) ───────────────────────
    const shipyardQueue = planet.queues.shipyard
    if (shipyardQueue.length > 0) {
      const current = shipyardQueue[0]!
      const def = getUnitDef(current.id)
      const productionCost = def?.productionCost ?? 0
      const remaining = Math.max(0, (current.eta ?? 0) - available)
      const overflow = available - (current.eta ?? 0)
      current.eta = remaining
      const spent = Math.max(0, productionCost - remaining)
      planet.progressMemory[current.id] = { productionSpent: spent, resourcePaid: true }
      if (remaining <= 0) {
        if (current.id === 'unit:worker') {
          planet.workers += 1
        } else {
          snapshot.fleets.push({ ...current, eta: undefined, location: planet.id } as Unit)
        }
        planet.progressMemory = Object.fromEntries(
          Object.entries(planet.progressMemory).filter(([key]) => key !== current.id)
        )
        if (planet.owner !== 'unclaimed' && planet.owner !== 'unknown') {
          addEvent(snapshot, planet.owner, {
            id: nextEventId(),
            type: 'ship-complete',
            severity: 'success',
            year: turn,
            titleKey: 'events.types.ship-complete.title',
            titleParams: { name: unitNameKey(current.id) },
            descriptionKey: 'events.types.ship-complete.description',
            descriptionParams: { location: getPlanetName(snapshot, planet.id) },
            relatedEntityId: planet.id,
            relatedEntityType: 'planet',
            read: false,
            timestamp: Date.now()
          })
        }
        planet.queues.shipyard = shipyardQueue.slice(1)
        if (overflow > 0) {
          planet.productionCarryover = overflow
        }
      }
    }
  }
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
    let nextSnapshot = snapshot

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
            deductResourceCosts(player, def.resourceCosts)
          }
        }
      }

      nextSnapshot = applyPlan(nextSnapshot, player, plan)
    }

    // Step 2: Add resource production from existing buildings (before completing new ones)
    for (const player of nextSnapshot.players) {
      const production = calculateResourceProduction(nextSnapshot.planets, player.id)
      applyResourceProduction(player, production)
    }

    let eventIndex = 0
    const nextEventId = () => `evt-${turn}-${eventIndex++}`

    // Step 3: Advance research and complete buildings/units
    advanceResearch(nextSnapshot, turn, nextEventId)
    advanceQueues(nextSnapshot, turn, nextEventId)

    // Step 4: Update resource deltas for display (production for next turn)
    updateResourceDeltas(nextSnapshot)

    nextSnapshot = { ...nextSnapshot, turn: turn + 1 }

    await repo.insertGameState(gameId, turn + 1, nextSnapshot)
    await repo.updateGameTurn(gameId, turn + 1)

    return { resolved: true }
  } catch (error) {
    await repo.releaseResolveLock(gameId)
    throw error
  }
}

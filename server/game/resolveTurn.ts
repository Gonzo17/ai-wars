import { initialState } from './initialState'
import { toPlayerId } from './playerId'
import type { GameRepository } from './repository'
import { TECH_DEFS } from '~~/shared/defs/research-tree'
import { getBuildingDef, getUnitDef } from '~~/shared/defs/production'
import type { GameEvent } from '~~/shared/types/events'
import type { BuildingId, PlanetId, PlayerId, ResearchId, Resource, SolarSystemId, Unit, UnitId } from '~~/shared/types/game'
import { adjustedProductionCost } from '~~/shared/types/planetSlots'
import { calculateResourceProduction, getResearchPointsPerTurn } from '~~/shared/utils/economy'
import { findLanePath, getSystemIdForLocation } from '~~/shared/utils/starlanes'
import { resolveFleetCombat } from '~~/shared/utils/combat'

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

/**
 * Move every en-route fleet one star lane along the (re-computed) shortest
 * path to its destination. Fleets arriving this turn become idle and emit
 * an arrival event.
 */
function advanceFleets(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  for (const fleet of snapshot.fleets) {
    if (fleet.status !== 'en-route' || !fleet.destination) continue
    const destinationId = fleet.destination as SolarSystemId
    const fromSystemId = getSystemIdForLocation(snapshot, fleet.location)
    const path = fromSystemId ? findLanePath(snapshot.systems, fromSystemId, destinationId) : null

    if (!path) {
      // No route (validation should prevent this) — stand down where we are
      fleet.status = 'idle'
      fleet.destination = undefined
      fleet.eta = undefined
      continue
    }

    if (path.length > 0) {
      fleet.location = path[0]!
      fleet.eta = path.length - 1
    }

    if (path.length <= 1) {
      fleet.location = destinationId
      fleet.status = 'idle'
      fleet.destination = undefined
      fleet.eta = undefined
      const systemName = snapshot.systems.find(s => s.id === destinationId)?.name ?? destinationId
      addEvent(snapshot, fleet.ownerId, {
        id: nextEventId(),
        type: 'army-arrived',
        severity: 'info',
        year: turn,
        titleKey: 'events.types.army-arrived.title',
        titleParams: { name: unitNameKey(fleet.defId ?? fleet.id) },
        descriptionKey: 'events.types.army-arrived.description',
        descriptionParams: { location: systemName },
        relatedEntityId: destinationId,
        relatedEntityType: 'system',
        read: false,
        timestamp: Date.now()
      })
    }
  }
}

/**
 * Resolve combat in every system where 2+ owners have fleets present.
 * Defense is at system granularity (vision): a fleet anywhere in the system
 * fights. Destroyed fleets are removed from the snapshot.
 */
function resolveCombat(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  const systemFleets = new Map<SolarSystemId, Unit[]>()
  for (const fleet of snapshot.fleets) {
    const systemId = getSystemIdForLocation(snapshot, fleet.location)
    if (!systemId) continue
    const list = systemFleets.get(systemId) ?? []
    list.push(fleet)
    systemFleets.set(systemId, list)
  }

  const destroyedIds = new Set<string>()

  for (const [systemId, fleets] of systemFleets) {
    const byOwner = new Map<PlayerId, Unit[]>()
    for (const fleet of fleets) {
      const list = byOwner.get(fleet.ownerId) ?? []
      list.push(fleet)
      byOwner.set(fleet.ownerId, list)
    }
    if (byOwner.size < 2) continue // no opposing fleets → no battle

    const result = resolveFleetCombat(byOwner)
    const systemName = snapshot.systems.find(s => s.id === systemId)?.name ?? systemId
    const totalDestroyed = result.sides.reduce((sum, side) => sum + side.destroyed.length, 0)

    for (const side of result.sides) {
      for (const lost of side.destroyed) destroyedIds.add(lost.id)
      const won = result.winnerId === side.ownerId
      const outcome = result.winnerId === null
        ? 'events.values.draw'
        : won ? 'events.values.victory' : 'events.values.defeat'
      const ourLosses = side.destroyed.length
      addEvent(snapshot, side.ownerId, {
        id: nextEventId(),
        type: 'combat',
        severity: won ? 'success' : result.winnerId === null ? 'warning' : 'critical',
        year: turn,
        titleKey: 'events.types.combat.title',
        titleParams: { location: systemName },
        descriptionKey: 'events.types.combat.description',
        descriptionParams: { outcome },
        details: [
          { labelKey: 'events.details.enemy-losses', value: String(totalDestroyed - ourLosses), icon: 'i-lucide-skull' },
          { labelKey: 'events.details.our-losses', value: String(ourLosses), icon: 'i-lucide-shield-x' }
        ],
        relatedEntityId: systemId,
        relatedEntityType: 'system',
        read: false,
        timestamp: Date.now()
      })
    }
  }

  if (destroyedIds.size > 0) {
    snapshot.fleets = snapshot.fleets.filter(fleet => !destroyedIds.has(fleet.id))
  }
}

/**
 * Idle colonizer fleets capture a planet in their system when no enemy fleet
 * contests it. Unclaimed planets and undefended enemy planets are both valid
 * targets; the colonizer is consumed on capture.
 */
function resolveColonization(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  const colonizers = snapshot.fleets.filter(fleet =>
    fleet.status !== 'en-route' && getUnitDef(fleet.defId ?? fleet.id)?.unitType === 'colonizer')

  const consumedFleetIds = new Set<string>()
  const capturedPlanetIds = new Set<string>()

  for (const colonizer of colonizers) {
    const systemId = getSystemIdForLocation(snapshot, colonizer.location)
    if (!systemId) continue

    const enemyPresent = snapshot.fleets.some(fleet =>
      fleet.ownerId !== colonizer.ownerId
      && !consumedFleetIds.has(fleet.id)
      && getSystemIdForLocation(snapshot, fleet.location) === systemId)
    if (enemyPresent) continue

    const target = snapshot.planets.find(planet =>
      planet.systemId === systemId
      && planet.kind !== 'star'
      && planet.owner !== colonizer.ownerId
      && planet.owner !== 'unknown'
      && !capturedPlanetIds.has(planet.id))
    if (!target) continue

    const previousOwner = target.owner
    target.owner = colonizer.ownerId
    target.queues = { build: [], shipyard: [] }
    if (target.workers < 1) target.workers = 1

    for (const player of snapshot.players) {
      player.planets = player.planets.filter(id => id !== target.id)
    }
    const newOwner = snapshot.players.find(p => p.id === colonizer.ownerId)
    if (newOwner && !newOwner.planets.includes(target.id)) newOwner.planets.push(target.id)

    capturedPlanetIds.add(target.id)
    consumedFleetIds.add(colonizer.id)

    addEvent(snapshot, colonizer.ownerId, {
      id: nextEventId(),
      type: 'colony-established',
      severity: 'success',
      year: turn,
      titleKey: previousOwner === 'unclaimed'
        ? 'events.types.colony-established.title'
        : 'events.types.colony-established.title-captured',
      titleParams: { name: target.name },
      descriptionKey: previousOwner === 'unclaimed'
        ? 'events.types.colony-established.description'
        : 'events.types.colony-established.description-captured',
      descriptionParams: { location: target.name },
      relatedEntityId: target.id,
      relatedEntityType: 'planet',
      read: false,
      timestamp: Date.now()
    })
  }

  if (consumedFleetIds.size > 0) {
    snapshot.fleets = snapshot.fleets.filter(fleet => !consumedFleetIds.has(fleet.id))
  }
}

/**
 * Idle star-constructor fleets capture their system's star when no enemy fleet
 * contests it — building the Dyson scaffold. The constructor is consumed; the
 * star becomes an owned build site (megastructures come later).
 */
function resolveStarCapture(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
  const constructors = snapshot.fleets.filter(fleet =>
    fleet.status !== 'en-route' && getUnitDef(fleet.defId ?? fleet.id)?.unitType === 'star-constructor')

  const consumedFleetIds = new Set<string>()

  for (const constructor of constructors) {
    const systemId = getSystemIdForLocation(snapshot, constructor.location)
    if (!systemId) continue

    const enemyPresent = snapshot.fleets.some(fleet =>
      fleet.ownerId !== constructor.ownerId
      && !consumedFleetIds.has(fleet.id)
      && getSystemIdForLocation(snapshot, fleet.location) === systemId)
    if (enemyPresent) continue

    const star = snapshot.planets.find(p =>
      p.kind === 'star'
      && p.systemId === systemId
      && p.owner !== constructor.ownerId
      && p.owner !== 'unknown')
    if (!star) continue

    star.owner = constructor.ownerId
    if (star.workers < 1) star.workers = 1
    consumedFleetIds.add(constructor.id)

    addEvent(snapshot, constructor.ownerId, {
      id: nextEventId(),
      type: 'star-captured',
      severity: 'success',
      year: turn,
      titleKey: 'events.types.star-captured.title',
      titleParams: { name: star.name },
      descriptionKey: 'events.types.star-captured.description',
      descriptionParams: { location: star.name },
      relatedEntityId: star.systemId,
      relatedEntityType: 'system',
      read: false,
      timestamp: Date.now()
    })
  }

  if (consumedFleetIds.size > 0) {
    snapshot.fleets = snapshot.fleets.filter(fleet => !consumedFleetIds.has(fleet.id))
  }
}

/** Keep each player's empireState.planetsControlled in sync with ownership. */
function updatePlanetsControlled(snapshot: GameSnapshot) {
  for (const player of snapshot.players) {
    player.research.empireState.planetsControlled = snapshot.planets.filter(p => p.owner === player.id && p.kind !== 'star').length
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
          // Assign a unique instance id; the def id stays available via defId
          snapshot.fleets.push({
            ...current,
            id: `${current.id}@${planet.id}@t${turn}` as UnitId,
            defId: current.id,
            eta: undefined,
            location: planet.id
          } as Unit)
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

    let eventIndex = 0
    const nextEventId = () => `evt-${turn}-${eventIndex++}`

    // Step 2: Move fleets one star lane along their routes
    advanceFleets(nextSnapshot, turn, nextEventId)

    // Step 3: Resolve combat where fleets meet, then colonize undefended planets
    resolveCombat(nextSnapshot, turn, nextEventId)
    resolveColonization(nextSnapshot, turn, nextEventId)
    resolveStarCapture(nextSnapshot, turn, nextEventId)
    updatePlanetsControlled(nextSnapshot)

    // Step 4: Add resource production from existing buildings (before completing new ones)
    for (const player of nextSnapshot.players) {
      const production = calculateResourceProduction(nextSnapshot.planets, player.id)
      applyResourceProduction(player, production)
    }

    // Step 5: Advance research and complete buildings/units
    advanceResearch(nextSnapshot, turn, nextEventId)
    advanceQueues(nextSnapshot, turn, nextEventId)

    // Step 6: Update resource deltas for display (production for next turn)
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

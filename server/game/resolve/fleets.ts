import { getUnitDef } from '~~/shared/defs/production'
import type { GameSnapshot, PlayerId, SolarSystemId, Unit } from '~~/shared/types/game'
import { resolveFleetCombat } from '~~/shared/utils/combat'
import { findLanePath, getSystemIdForLocation } from '~~/shared/utils/starlanes'
import { addEvent, unitNameKey } from './events'

/**
 * Move every en-route fleet one star lane along the (re-computed) shortest
 * path to its destination. Fleets arriving this turn become idle and emit
 * an arrival event.
 */
export function advanceFleets(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
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
export function resolveCombat(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
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

const STAR_FORTRESS_ID = 'bld:star-fortress'

/**
 * A completed Star Fortress garrisons its whole system: an enemy cannot quietly
 * colonize planets or capture the star there. (A future siege mechanic will let
 * a strong enough fleet break it; for now it is an absolute cheap-grab block.)
 */
export function systemHasEnemyFortress(snapshot: GameSnapshot, systemId: string, actorId: string): boolean {
  return snapshot.planets.some(p =>
    p.systemId === systemId
    && p.kind === 'star'
    && p.owner !== actorId
    && p.owner !== 'unclaimed'
    && p.owner !== 'unknown'
    && p.slots.some(s => s.buildingId === STAR_FORTRESS_ID && !s.isConstructing))
}

/**
 * Idle colonizer fleets capture a planet in their system when no enemy fleet
 * contests it. Unclaimed planets and undefended enemy planets are both valid
 * targets; the colonizer is consumed on capture.
 */
export function resolveColonization(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
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
    if (systemHasEnemyFortress(snapshot, systemId, colonizer.ownerId)) continue

    const target = snapshot.planets.find(planet =>
      planet.systemId === systemId
      && planet.kind !== 'star'
      && planet.owner !== colonizer.ownerId
      && planet.owner !== 'unknown'
      && !capturedPlanetIds.has(planet.id))
    if (!target) continue

    const previousOwner = target.owner
    target.owner = colonizer.ownerId
    target.queues = { production: [] }
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
export function resolveStarCapture(snapshot: GameSnapshot, turn: number, nextEventId: () => string) {
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
    if (systemHasEnemyFortress(snapshot, systemId, constructor.ownerId)) continue

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

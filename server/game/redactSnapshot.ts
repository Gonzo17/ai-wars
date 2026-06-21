import { getSystemIdForLocation } from '~~/shared/utils/starlanes'
import type { GameSnapshot, Planet, PlayerId, PlayerSnapshot } from '~~/shared/types/game'

/**
 * Fog of war (v1). The server stores the full snapshot, but each client must
 * only see what its player is entitled to. This redacts a snapshot for one
 * viewer before it leaves the server:
 *
 *  - own data is untouched (planets, resources, research, events, fleets)
 *  - unclaimed planets stay fully visible (they are expansion targets)
 *  - enemy planet *contents* (buildings, queues, workers) are hidden; only the
 *    map-level facts remain (id, owner, name, type, size, location)
 *  - enemy players' private state (resources, research, events) is stripped
 *  - enemy fleets are only visible in systems where the viewer owns a planet
 *    (so a roaming fleet stays hidden until it reaches your space)
 *
 * Scouting reveals (a fleet/probe granting deeper intel) are intentionally left
 * for a later pass.
 */
export function redactSnapshotFor(snapshot: GameSnapshot, viewerId: PlayerId): GameSnapshot {
  const next = structuredClone(snapshot)

  const viewerSystemIds = new Set(
    next.planets.filter(p => p.owner === viewerId).map(p => p.systemId)
  )

  next.players = next.players.map(player =>
    player.id === viewerId ? player : redactEnemyPlayer(player)
  )

  next.planets = next.planets.map(planet =>
    (planet.owner === viewerId || planet.owner === 'unclaimed') ? planet : redactEnemyPlanet(planet)
  )

  next.fleets = next.fleets.filter((fleet) => {
    if (fleet.ownerId === viewerId) return true
    const systemId = getSystemIdForLocation(next, fleet.location)
    return systemId !== null && viewerSystemIds.has(systemId)
  })

  return next
}

function redactEnemyPlayer(player: PlayerSnapshot): PlayerSnapshot {
  return {
    ...player,
    fleets: [],
    resources: [],
    availableResearchIds: [],
    events: [],
    research: {
      ascensionTierReached: 'k0.6',
      computeLevel: 0,
      empireState: { planetsControlled: player.planets.length, homeSystemMajority: false, intelLevel: 'low', starsControlled: 0, dysonStages: 0 },
      completedTechIds: [],
      activeResearch: undefined,
      progressMemory: {}
    }
  }
}

function redactEnemyPlanet(planet: Planet): Planet {
  return {
    ...planet,
    slots: [],
    queues: { production: [] },
    progressMemory: {},
    workers: 0,
    productionCarryover: 0
  }
}

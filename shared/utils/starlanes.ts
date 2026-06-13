import type { GameSnapshot, SolarSystem, SolarSystemId, Unit } from '../types/game'

/**
 * Resolve any unit location (planet id or system id) to the system it sits in.
 * Galaxy-level locations are not used for fleets.
 */
export function getSystemIdForLocation(snapshot: GameSnapshot, location: Unit['location']): SolarSystemId | null {
  if (location.startsWith('sys:')) {
    return snapshot.systems.some(s => s.id === location) ? location as SolarSystemId : null
  }
  if (location.startsWith('pl:')) {
    return snapshot.planets.find(p => p.id === location)?.systemId ?? null
  }
  return null
}

/**
 * BFS shortest path over the star-lane graph.
 * Returns the systems to traverse (excluding `fromId`, including `toId`),
 * `[]` when already there, or `null` when no route exists.
 */
export function findLanePath(systems: SolarSystem[], fromId: SolarSystemId, toId: SolarSystemId): SolarSystemId[] | null {
  if (fromId === toId) return []
  const byId = new Map(systems.map(system => [system.id, system]))
  if (!byId.has(fromId) || !byId.has(toId)) return null

  const previous = new Map<SolarSystemId, SolarSystemId>()
  const queue: SolarSystemId[] = [fromId]
  const visited = new Set<SolarSystemId>([fromId])

  while (queue.length > 0) {
    const currentId = queue.shift()!
    for (const nextId of byId.get(currentId)?.connections ?? []) {
      if (visited.has(nextId) || !byId.has(nextId)) continue
      visited.add(nextId)
      previous.set(nextId, currentId)
      if (nextId === toId) {
        const path: SolarSystemId[] = [toId]
        let step = toId
        while (previous.get(step) !== undefined && previous.get(step) !== fromId) {
          step = previous.get(step)!
          path.unshift(step)
        }
        return path
      }
      queue.push(nextId)
    }
  }

  return null
}

/** Travel time in turns (one lane per turn), or null when unreachable. */
export function getLaneEta(systems: SolarSystem[], fromId: SolarSystemId, toId: SolarSystemId): number | null {
  return findLanePath(systems, fromId, toId)?.length ?? null
}

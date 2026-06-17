import type { PlayerId, Unit } from '../types/game'

/**
 * Combat weight per unit type. Warships fight at full strength; support craft
 * (probes, colony ships) are poor combatants. This is the soft-RPS hook —
 * extend to a per-matchup matrix when the unit roster grows.
 */
export const COMBAT_WEIGHT: Record<Unit['type'], number> = {
  'battleship': 1,
  'probe': 0.4,
  'colonizer': 0.3,
  'star-constructor': 0.3
}

const EPSILON = 1e-9

/** Effective offensive power of a group of fleets (strength × type weight). */
export function fleetOffense(fleets: Unit[]): number {
  return fleets.reduce((sum, fleet) => sum + fleet.strength * COMBAT_WEIGHT[fleet.type], 0)
}

export interface CombatSideResult {
  ownerId: PlayerId
  survivors: Unit[]
  destroyed: Unit[]
  offense: number
}

export interface CombatResult {
  /** Winning owner, or null on a mutual-destruction draw. */
  winnerId: PlayerId | null
  sides: CombatSideResult[]
}

/**
 * Apply `damagePool` worth of casualties to a fleet group. Weakest ships die
 * first; a ship survives once the remaining pool can no longer cover its full
 * strength (no partial kills). Models attrition without a single big ship
 * dying to a scratch.
 */
function applyCasualties(fleets: Unit[], damagePool: number): { survivors: Unit[], destroyed: Unit[] } {
  const sorted = [...fleets].sort((a, b) => a.strength - b.strength)
  const survivors: Unit[] = []
  const destroyed: Unit[] = []
  let pool = damagePool
  for (const fleet of sorted) {
    if (pool >= fleet.strength - EPSILON) {
      pool -= fleet.strength
      destroyed.push(fleet)
    } else {
      survivors.push(fleet)
    }
  }
  return { survivors, destroyed }
}

/**
 * Resolve a clash between 2+ owners' fleets sharing a location.
 *
 * The side with the highest offense wins; every other side is wiped out.
 * The winner takes casualties equal to the combined offense of all losers.
 * A tie for the top offense is mutual destruction (winnerId = null).
 */
export function resolveFleetCombat(fleetsByOwner: Map<PlayerId, Unit[]>): CombatResult {
  const sides = [...fleetsByOwner.entries()].map(([ownerId, fleets]) => ({
    ownerId,
    fleets,
    offense: fleetOffense(fleets)
  }))

  const maxOffense = Math.max(...sides.map(side => side.offense))
  const topSides = sides.filter(side => Math.abs(side.offense - maxOffense) < EPSILON)

  // Tie at the top → everyone is destroyed
  if (topSides.length > 1) {
    return {
      winnerId: null,
      sides: sides.map(side => ({ ownerId: side.ownerId, survivors: [], destroyed: side.fleets, offense: side.offense }))
    }
  }

  const winner = topSides[0]!
  const losersOffense = sides
    .filter(side => side.ownerId !== winner.ownerId)
    .reduce((sum, side) => sum + side.offense, 0)
  const { survivors, destroyed } = applyCasualties(winner.fleets, losersOffense)

  return {
    winnerId: winner.ownerId,
    sides: sides.map(side => side.ownerId === winner.ownerId
      ? { ownerId: side.ownerId, survivors, destroyed, offense: side.offense }
      : { ownerId: side.ownerId, survivors: [], destroyed: side.fleets, offense: side.offense })
  }
}

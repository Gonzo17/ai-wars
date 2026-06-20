import type { GameSnapshot, PlayerId } from '../types/game'

/**
 * Victory tuning (PLACEHOLDERS — a balance pass happens once the loop is fully
 * playable; see docs/VISION.md "Three victory conditions"). The shared shape is
 * `condition met → countdown → hold to win`.
 */
export const MILITARY_HOLD_TURNS = 5
/**
 * Moderate planet floor on top of "own every homeworld" — keeps the military win
 * "far below take everything" while preventing a fluke win from a lone capture.
 */
export const MILITARY_PLANET_THRESHOLD = 3

/**
 * Military trigger: a player controls EVERY homeworld (their own + all enemies')
 * and holds at least a moderate number of planets. Capturing/holding the last
 * enemy homeworld is the decisive act; the threshold stops trivial edge wins.
 *
 * Reads `empireState.planetsControlled`, so it must run AFTER
 * `updatePlanetsControlled` in resolution.
 */
export function playerMeetsMilitary(snapshot: GameSnapshot, playerId: PlayerId): boolean {
  const homeworlds = snapshot.planets.filter(p => p.isHomeworld)
  if (homeworlds.length === 0) return false
  if (!homeworlds.every(p => p.owner === playerId)) return false

  const player = snapshot.players.find(p => p.id === playerId)
  const planetsControlled = player?.research.empireState.planetsControlled ?? 0
  return planetsControlled >= MILITARY_PLANET_THRESHOLD
}

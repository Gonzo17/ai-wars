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

export const EXPANSION_HOLD_TURNS = 8
/** Share of the player's OWN galaxy's stars to hold for the expansion (K3.0) win
 *  — galaxy-scoped, not universe-wide. Placeholder fraction; balance in Phase 4. */
export const EXPANSION_STAR_FRACTION = 0.9

/**
 * Expansion trigger (wide / Kardashev III): hold a supermajority of the stars in
 * the player's **own home galaxy** (the galaxy containing their homeworld) — not
 * of all stars in the universe. Reads star ownership directly off the snapshot.
 */
export function playerMeetsExpansion(snapshot: GameSnapshot, playerId: PlayerId): boolean {
  const homeworld = snapshot.planets.find(p => p.isHomeworld && p.owner === playerId)
  if (!homeworld) return false
  const galaxy = snapshot.galaxies.find(g => g.solarSystems.includes(homeworld.systemId))
  if (!galaxy) return false

  const galaxyStars = snapshot.planets.filter(p => p.kind === 'star' && galaxy.solarSystems.includes(p.systemId))
  if (galaxyStars.length === 0) return false
  const owned = galaxyStars.filter(p => p.owner === playerId).length
  return owned / galaxyStars.length >= EXPANSION_STAR_FRACTION
}

export const RESEARCH_HOLD_TURNS = 6
/**
 * Research capstone tech that triggers the tall/Temporal-Ascension win.
 * PLACEHOLDER: reuses the current top tech until the Phase 2 tech-tree rewrite
 * adds a dedicated `tech:temporal-ascension` capstone (see docs/VISION.md).
 */
export const RESEARCH_VICTORY_TECH = 'tech:galactic-network'

/**
 * Research trigger (tall): the capstone tech is complete. The hold duration
 * stands in for the globally-announced completion countdown; once a "destroy the
 * wonder" counter exists, breaking it will reset the countdown like the others.
 */
export function playerMeetsResearch(snapshot: GameSnapshot, playerId: PlayerId): boolean {
  const player = snapshot.players.find(p => p.id === playerId)
  return player?.research.completedTechIds.includes(RESEARCH_VICTORY_TECH) ?? false
}

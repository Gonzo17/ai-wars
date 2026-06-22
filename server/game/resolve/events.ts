import type { GameEvent } from '~~/shared/types/events'
import type { BuildingId, GameSnapshot, PlanetId, PlayerId, ProjectId, ResearchId, UnitId } from '~~/shared/types/game'

/** i18n key helpers — entity id → translation key for event titles. */
export const buildingNameKey = (buildingId: BuildingId) => `game.buildings.${buildingId.replace('bld:', '')}.name`
export const unitNameKey = (unitId: UnitId) => `game.units.${unitId.replace('unit:', '')}.name`
export const projectNameKey = (projectId: ProjectId) => `game.projects.${projectId.replace('proj:', '')}.name`
export const techNameKey = (techId: ResearchId) => `game.research.techs.${techId.replace('tech:', '')}.name`

export function getPlanetName(snapshot: GameSnapshot, planetId: PlanetId): string {
  const planet = snapshot.planets.find(p => p.id === planetId)
  return planet?.name ?? planetId
}

export function addEvent(snapshot: GameSnapshot, playerId: PlayerId, event: GameEvent) {
  const player = snapshot.players.find(p => p.id === playerId)
  if (!player) return
  player.events = [...(player.events ?? []), event]
}

/**
 * Per-resolve event-id factory. Ids are stable within a turn (`evt-<turn>-<n>`)
 * so a snapshot's events are deterministic for a given turn resolution.
 */
export function createEventIdFactory(turn: number): () => string {
  let index = 0
  return () => `evt-${turn}-${index++}`
}

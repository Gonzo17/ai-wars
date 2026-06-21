import type { BuildingId, PlanetId, ResearchId, SolarSystemId, UnitId } from './game'

export type TurnCommandType = 'startResearch' | 'setProductionQueue' | 'moveFleet'

export type StartResearchCommand = {
  type: 'startResearch'
  researchId: ResearchId
}

/** One desired entry in a planet's production queue (client-declared, server-validated). */
export type ProductionQueueCommandItem
  = | { kind: 'building', slotIndex: number, buildingId: BuildingId }
    | { kind: 'unit', unitId: UnitId }

/**
 * The full, ordered production queue the client wants for one planet this turn.
 * Declarative: add/cancel/reorder all reduce to resending the whole list, so the
 * server just validates and sets `planet.queues.production`.
 */
export type SetProductionQueueCommand = {
  type: 'setProductionQueue'
  planetId: PlanetId
  items: ProductionQueueCommandItem[]
}

export type MoveFleetCommand = {
  type: 'moveFleet'
  fleetId: UnitId
  toSystemId: SolarSystemId
}

export type TurnCommand = StartResearchCommand | SetProductionQueueCommand | MoveFleetCommand

export type TurnPlan = {
  commands: TurnCommand[]
}

export type ValidationErrorCode = 'INVALID_TURN' | 'NOT_OWNER' | 'NOT_FOUND' | 'INVALID_COMMAND' | 'INVALID_STATE' | 'INSUFFICIENT_RESOURCES'

export interface ValidationError {
  code: ValidationErrorCode
  message: string
  path?: string
}

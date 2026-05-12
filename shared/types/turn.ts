import type { BuildingId, PlanetId, ResearchId, SolarSystemId, UnitId } from './game'

export type TurnCommandType = 'startResearch' | 'buildStructure' | 'buildUnit' | 'moveFleet'

export type StartResearchCommand = {
  type: 'startResearch'
  researchId: ResearchId
}

export type BuildStructureCommand = {
  type: 'buildStructure'
  planetId: PlanetId
  buildingId: BuildingId
  slotIndex: number
}

export type BuildUnitCommand = {
  type: 'buildUnit'
  planetId: PlanetId
  unitId: UnitId
}

export type MoveFleetCommand = {
  type: 'moveFleet'
  fleetId: UnitId
  toSystemId: SolarSystemId
}

export type TurnCommand = StartResearchCommand | BuildStructureCommand | BuildUnitCommand | MoveFleetCommand

export type TurnPlan = {
  commands: TurnCommand[]
}

export type ValidationErrorCode = 'INVALID_TURN' | 'NOT_OWNER' | 'NOT_FOUND' | 'INVALID_COMMAND' | 'INVALID_STATE' | 'INSUFFICIENT_RESOURCES'

export interface ValidationError {
  code: ValidationErrorCode
  message: string
  path?: string
}

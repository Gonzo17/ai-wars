import type { GameEvent } from './events'
import type { PlayerResearchState } from './research'

export type Id<T extends string> = `${T}:${string}`

export type IntelLevel = 'low' | 'medium' | 'high'

export type GameId = Id<'game'>
export type PlayerId = Id<'player'>

export type ShipId = Id<'ship'>
export type ProbeId = Id<'probe'>

export type ResearchId = Id<'tech'>

export type GalaxyId = Id<'galaxy'>
export interface Galaxy {
  id: GalaxyId
  name: string
  intel: IntelLevel
  connections: GalaxyId[]
  solarSystems: SolarSystemId[]
  location: {
    x: number
    y: number
  }
}

export type SolarSystemId = Id<'sys'>
export interface SolarSystem {
  id: SolarSystemId
  name: string
  intel: IntelLevel
  connections: SolarSystemId[]
  planets: PlanetId[]
  location: {
    x: number
    y: number
  }
}

export type PlanetId = Id<'pl'>

export type ResourceNodeType = 'ore'

export interface PlanetSlotData {
  index: number
  zone: 'surface' | 'orbital'
  buildingId: BuildingId | null
  buildingLevel: number
  isConstructing: boolean
  constructionTimeLeft: number
  resourceNode: ResourceNodeType | null
}

export interface BuildQueueItem {
  slotIndex: number
}

export interface Planet {
  id: PlanetId
  systemId: SolarSystemId
  name: string
  owner: PlayerId | 'unknown' | 'unclaimed'
  /** True for a player's starting world (always terrestrial). Drives the military victory (capture/destroy all homeworlds). */
  isHomeworld?: boolean
  type: 'terrestrial' | 'gas-giant' | 'ice-giant' | 'barren' | 'oceanic' | 'desert'
  size: 'small' | 'medium' | 'large' | 'huge'
  workers: number
  productionPerWorker: number
  slots: PlanetSlotData[]
  queues: {
    build: BuildQueueItem[]
    shipyard: Unit[]
  }
  progressMemory: Record<string, { productionSpent: number, resourcePaid: boolean }>
  productionCarryover: number
  location: {
    x: number
    y: number
  }
}

export type BuildingId = Id<'bld'>
export interface Building {
  id: BuildingId
  level: number
  isConstructing: boolean
  constructionTimeLeft: number
  costs: {
    energy: number
    minerals: number
    rare: number
  }
  requirements: {
    buildings: { id: BuildingId, level: number }[]
    research: ResearchId[]
  }
}

export interface Research {
  id: ResearchId
  yearsRequired: number
  prerequisites: string[]
}

export type TravelStatus = 'idle' | 'en-route'

export type UnitId = Id<'unit'>
export interface Unit {
  /** Unique instance id once the unit joined the fleet list; equals the def id while still in a shipyard queue. */
  id: UnitId
  /** Definition id (lookup key into UNIT_DEFS). Set when the unit completes. */
  defId?: UnitId
  type: 'battleship' | 'probe' | 'colonizer'
  name: string
  status: TravelStatus
  location: PlanetId | SolarSystemId | GalaxyId
  destination?: PlanetId | SolarSystemId | GalaxyId
  eta?: number
  strength: number
  ownerId: PlayerId
}

export type ResourceId = Id<'res'>
export interface Resource {
  key: ResourceId
  current: number
  max: number
  delta: number
}

export type Energy = Resource & { key: 'res:energy' }
export type Material = Resource & { key: 'res:material' }
export type Rare = Resource & { key: 'res:rare' }

export type GameStatus = 'active' | 'finished'
export type GamePhase = 'planning' | 'resolving'

export interface PlayerSnapshot {
  id: PlayerId
  userId: string
  planets: PlanetId[]
  fleets: UnitId[]
  research: PlayerResearchState
  availableResearchIds: ResearchId[]
  resources: Resource[]
  events: GameEvent[]
}

export interface GameSnapshot {
  turn: number
  players: PlayerSnapshot[]
  galaxies: Galaxy[]
  systems: SolarSystem[]
  planets: Planet[]
  fleets: Unit[]
}

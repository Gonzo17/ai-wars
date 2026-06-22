import type { BuildingId, Planet, ResearchId, ResourceId } from './game'

/**
 * Phase-2 district model (see memory project-phase2-district-model). A planet slot
 * holds EITHER a district (a category with an internal branching tree of buildings)
 * OR a megastructure (a slot-eating wonder), OR is empty. The branch tree itself is
 * static data in DISTRICT_DEFS; a slot only stores which nodes are built.
 */

export type PlanetType = Planet['type']

/** The district categories. Five mirror the resources; four are functional. */
export type DistrictType
  // resource districts (produce a stored resource)
  = | 'energy' | 'matter' | 'rare' | 'exotic' | 'antimatter'
  // functional districts
    | 'research' | 'production' | 'shipyard' | 'defense'

export type SlotZonePlacement = 'surface' | 'orbital' | 'any'

/**
 * Per-turn output of a district node or megastructure. `energy`/`matter`/`research`/
 * `production` feed the base economy; `strategic` carries the tiered resources
 * (rare/exotic/antimatter), each only produced when the slot sits on its deposit.
 */
export interface NodeOutput {
  energy?: number
  matter?: number
  research?: number
  /** Build throughput this node adds (the data center carries the planet's base). */
  production?: number
  strategic?: Partial<Record<ResourceId, number>>
}

/** Upfront build cost. `energy` spends the stockpile; `matter`/`strategic` likewise. */
export interface NodeCost {
  energy?: number
  matter?: number
  strategic?: Partial<Record<ResourceId, number>>
}

/**
 * One node in a district's branch tree. Node ids reuse the BuildingId brand so the
 * slot can keep storing plain ids. `prereqIds` are *within-district* prerequisites
 * (the base node has none); `branchGroup` marks a set of mutually-exclusive siblings
 * — once you build one, the others in that group lock (the strategic commit).
 */
export interface DistrictNodeDef {
  id: BuildingId
  prereqIds: BuildingId[]
  /** Mutually-exclusive sibling set; pick one path. Omit for always-available nodes. */
  branchGroup?: string
  /** Tech gate (Phase-2 tech tree). */
  research?: ResearchId
  cost: NodeCost
  buildTime: number
  output?: NodeOutput
}

export interface DistrictDef {
  type: DistrictType
  /** Planet types that can open this district at all. */
  availableOn: PlanetType[]
  zone: SlotZonePlacement
  /** Output multiplier by planet type (◎ strong = >1, weak = <1). Default 1. */
  weights?: Partial<Record<PlanetType, number>>
  /** The branch tree; nodes with empty `prereqIds` are the openable base(s). */
  tree: DistrictNodeDef[]
}

export type MegastructureClass = 'national' | 'unique' | 'victory'

export interface MegastructureDef {
  id: BuildingId
  class: MegastructureClass
  zone: 'surface' | 'orbital'
  research?: ResearchId
  cost: NodeCost
  buildTime: number
  output?: NodeOutput
  /** Staged wonders (e.g. Dyson) build up levels in place. */
  maxLevel?: number
}

/** A slot's content: empty, a district (with its built nodes), or a megastructure. */
export type SlotContent
  = | null
    | { kind: 'district', type: DistrictType, nodes: BuildingId[], building?: { id: BuildingId, timeLeft: number } }
    | { kind: 'megastructure', id: BuildingId, level: number, building?: { timeLeft: number } }

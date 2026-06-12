import { toPlayerId } from './playerId'
import {
  TECH_DEFS
} from '~~/shared/defs/research-tree'
import { calculateResourceProduction } from '~~/shared/utils/economy'
import type { BuildingId, GameSnapshot, Galaxy, Planet, PlanetId, PlanetSlotData, PlayerSnapshot, ResearchId, Resource, SolarSystem, SolarSystemId, ResourceNodeType } from '~~/shared/types/game'
import type { PlayerResearchState } from '~~/shared/types/research'
import { createPlanetSlots, ORBITAL_BUILDING_IDS } from '~~/shared/types/planetSlots'

/**
 * Place a building into a planet's slot array, picking the next free slot
 * in the appropriate zone (surface or orbital).
 */
function placeBuilding(slots: PlanetSlotData[], id: BuildingId, level: number): void {
  const isOrbital = ORBITAL_BUILDING_IDS.includes(id)
  const slot = slots.find(s =>
    s.buildingId === null
    && (isOrbital ? s.zone === 'orbital' : s.zone === 'surface')
  )
  if (slot) {
    slot.buildingId = id
    slot.buildingLevel = level
  }
}

function makeSlots(
  buildings: Array<{ id: BuildingId, level: number }>,
  resourceNodes: Map<number, ResourceNodeType> = new Map()
): PlanetSlotData[] {
  const slots = createPlanetSlots(resourceNodes)
  for (const { id, level } of buildings) {
    placeBuilding(slots, id, level)
  }
  return slots
}

/**
 * Flavor names for player home systems. Every player gets the same starting
 * setup (buildings, resource nodes, planet types) — only names and map
 * positions differ. Past four players we fall back to generated names.
 */
const HOME_TEMPLATES = [
  { systemId: 'sys:lyra', systemName: 'Lyra', primaryId: 'pl:aurora', primaryName: 'Aurora Prime', secondaryId: 'pl:borealis', secondaryName: 'Borealis', location: { x: 22, y: 35 } },
  { systemId: 'sys:vega', systemName: 'Vega', primaryId: 'pl:meridian', primaryName: 'Meridian Prime', secondaryId: 'pl:australis', secondaryName: 'Australis', location: { x: 78, y: 65 } },
  { systemId: 'sys:cygnus', systemName: 'Cygnus', primaryId: 'pl:zenith', primaryName: 'Zenith Prime', secondaryId: 'pl:umbra', secondaryName: 'Umbra', location: { x: 22, y: 65 } },
  { systemId: 'sys:orion', systemName: 'Orion', primaryId: 'pl:solace', primaryName: 'Solace Prime', secondaryId: 'pl:vesper', secondaryName: 'Vesper', location: { x: 78, y: 35 } }
] as const

type HomeTemplate = {
  systemId: SolarSystemId
  systemName: string
  primaryId: PlanetId
  primaryName: string
  secondaryId: PlanetId
  secondaryName: string
  location: { x: number, y: number }
}

function homeTemplate(index: number): HomeTemplate {
  const template = HOME_TEMPLATES[index]
  if (template) {
    return {
      systemId: template.systemId,
      systemName: template.systemName,
      primaryId: template.primaryId,
      primaryName: template.primaryName,
      secondaryId: template.secondaryId,
      secondaryName: template.secondaryName,
      location: template.location
    }
  }
  const n = index + 1
  return {
    systemId: `sys:home-${n}`,
    systemName: `Home ${n}`,
    primaryId: `pl:home-${n}-prime`,
    primaryName: `Home ${n} Prime`,
    secondaryId: `pl:home-${n}-minor`,
    secondaryName: `Home ${n} Minor`,
    location: { x: 50 + (n % 2 ? -30 : 30), y: 20 + ((n * 13) % 60) }
  }
}

function makeHomePlanets(template: HomeTemplate, owner: Planet['owner']): Planet[] {
  return [
    {
      id: template.primaryId,
      systemId: template.systemId,
      name: template.primaryName,
      owner,
      type: 'terrestrial',
      size: 'large',
      workers: 1,
      productionPerWorker: 20,
      slots: makeSlots(
        [
          { id: 'bld:fusion-core' as BuildingId, level: 2 },
          { id: 'bld:hydroponics' as BuildingId, level: 3 },
          { id: 'bld:orbital-dock' as BuildingId, level: 1 },
          { id: 'bld:data-center' as BuildingId, level: 1 }
        ],
        new Map([[2, 'ore']])
      ),
      queues: { build: [], shipyard: [] },
      progressMemory: {},
      productionCarryover: 0,
      location: { x: 28, y: 44 }
    },
    {
      id: template.secondaryId,
      systemId: template.systemId,
      name: template.secondaryName,
      owner,
      type: 'ice-giant',
      size: 'medium',
      workers: 1,
      productionPerWorker: 20,
      slots: makeSlots(
        [
          { id: 'bld:refinery-node' as BuildingId, level: 1 },
          { id: 'bld:listening-post' as BuildingId, level: 1 }
        ]
      ),
      queues: { build: [], shipyard: [] },
      progressMemory: {},
      productionCarryover: 0,
      location: { x: 52, y: 62 }
    }
  ]
}

export function initialState(userIds: string[], turn = 1): GameSnapshot {
  const availableResearchIds = TECH_DEFS.filter(t => t.prerequisites.length === 0).map(t => t.id as ResearchId)
  const baseResources: Resource[] = [
    { key: 'res:energy', current: 500, max: 2000, delta: 0 },
    { key: 'res:material', current: 100, max: 2000, delta: 0 },
    { key: 'res:rare', current: 0, max: 500, delta: 0 }
  ]

  const players: PlayerSnapshot[] = userIds.map((userId) => {
    const research: PlayerResearchState = {
      ascensionTierReached: 'k0.6',
      computeLevel: 1,
      empireState: {
        planetsControlled: 2,
        homeSystemMajority: true,
        intelLevel: 'low'
      },
      completedTechIds: [],
      activeResearch: undefined,
      progressMemory: {}
    }
    return {
      id: toPlayerId(userId),
      userId,
      planets: [],
      fleets: [],
      research,
      availableResearchIds,
      resources: structuredClone(baseResources),
      events: []
    }
  })

  // One identical home system per player, all linked to a neutral central system.
  const planets: Planet[] = []
  const homeSystems: SolarSystem[] = []
  const neutralSystemId: SolarSystemId = 'sys:nadir'

  players.forEach((player, index) => {
    const template = homeTemplate(index)
    const homePlanets = makeHomePlanets(template, player.id)
    planets.push(...homePlanets)
    player.planets = homePlanets.map(planet => planet.id)
    homeSystems.push({
      id: template.systemId,
      name: template.systemName,
      intel: 'high',
      connections: [neutralSystemId],
      planets: homePlanets.map(planet => planet.id),
      location: template.location
    })
  })

  planets.push({
    id: 'pl:nadir-outpost',
    systemId: neutralSystemId,
    name: 'Nadir Outpost',
    owner: 'unclaimed',
    type: 'barren',
    size: 'small',
    workers: 1,
    productionPerWorker: 20,
    slots: makeSlots([
      { id: 'bld:landing-pad' as BuildingId, level: 1 }
    ]),
    queues: { build: [], shipyard: [] },
    progressMemory: {},
    productionCarryover: 0,
    location: { x: 74, y: 38 }
  })

  const systems: SolarSystem[] = [
    ...homeSystems,
    {
      id: neutralSystemId,
      name: 'Nadir',
      intel: 'medium',
      connections: [...homeSystems.map(system => system.id), 'sys:helix'],
      planets: ['pl:nadir-outpost'],
      location: { x: 50, y: 50 }
    },
    {
      id: 'sys:helix',
      name: 'Helix',
      intel: 'low',
      connections: [neutralSystemId],
      planets: [],
      location: { x: 42, y: 80 }
    }
  ]

  const galaxies: Galaxy[] = [
    {
      id: 'galaxy:aurora',
      name: 'Aurora',
      intel: 'high',
      connections: ['galaxy:veil'],
      solarSystems: [...homeSystems.map(system => system.id), neutralSystemId],
      location: { x: 30, y: 42 }
    },
    {
      id: 'galaxy:veil',
      name: 'Veil',
      intel: 'medium',
      connections: ['galaxy:aurora'],
      solarSystems: ['sys:helix'],
      location: { x: 68, y: 58 }
    }
  ]

  // Initial resource deltas based on each player's starting buildings
  for (const player of players) {
    const production = calculateResourceProduction(planets, player.id)
    const energyRes = player.resources.find(r => r.key === 'res:energy')
    const mineralRes = player.resources.find(r => r.key === 'res:material')
    const rareRes = player.resources.find(r => r.key === 'res:rare')
    if (energyRes) energyRes.delta = production.energy
    if (mineralRes) mineralRes.delta = production.minerals
    if (rareRes) rareRes.delta = production.rare
  }

  return {
    turn,
    players,
    galaxies,
    systems,
    planets,
    fleets: []
  }
}

import { toPlayerId } from './playerId'
import {
  TECH_DEFS
} from '~~/shared/defs/research-tree'
import { calculateResourceProduction } from '~~/shared/utils/economy'
import type { BuildingId, GameSnapshot, Galaxy, Planet, PlanetId, PlanetSlotData, PlayerSnapshot, ResearchId, Resource, SolarSystem, SolarSystemId, ResourceNodeType } from '~~/shared/types/game'
import type { PlayerResearchState } from '~~/shared/types/research'
import { createPlanetSlots, ORBITAL_BUILDING_IDS } from '~~/shared/types/planetSlots'

/**
 * Map layout (vision: Civ-continents). Each player gets their OWN galaxy with
 * three systems — home (2 owned planets), a reach system and a gateway system
 * (both with one unclaimed planet to expand into). Every gateway links by a
 * long lane to a single shared, contested **Frontier** galaxy in the middle.
 * So players expand inside their own galaxy and clash over the Frontier.
 */

const FRONTIER_GALAXY = 'galaxy:frontier'
const FRONTIER_SYSTEM: SolarSystemId = 'sys:frontier'

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

type HomeTemplate = {
  key: string
  galaxyName: string
  systemName: string
  primaryId: PlanetId
  primaryName: string
  secondaryId: PlanetId
  secondaryName: string
}

const HOME_TEMPLATES: HomeTemplate[] = [
  { key: 'lyra', galaxyName: 'Lyra Reach', systemName: 'Lyra', primaryId: 'pl:aurora', primaryName: 'Aurora Prime', secondaryId: 'pl:borealis', secondaryName: 'Borealis' },
  { key: 'vega', galaxyName: 'Vega Expanse', systemName: 'Vega', primaryId: 'pl:meridian', primaryName: 'Meridian Prime', secondaryId: 'pl:australis', secondaryName: 'Australis' },
  { key: 'cygnus', galaxyName: 'Cygnus Drift', systemName: 'Cygnus', primaryId: 'pl:zenith', primaryName: 'Zenith Prime', secondaryId: 'pl:umbra', secondaryName: 'Umbra' },
  { key: 'orion', galaxyName: 'Orion Verge', systemName: 'Orion', primaryId: 'pl:solace', primaryName: 'Solace Prime', secondaryId: 'pl:vesper', secondaryName: 'Vesper' }
]

function homeTemplate(index: number): HomeTemplate {
  const template = HOME_TEMPLATES[index]
  if (template) return template
  const n = index + 1
  return {
    key: `sector-${n}`,
    galaxyName: `Sector ${n}`,
    systemName: `Home ${n}`,
    primaryId: `pl:home-${n}-prime` as PlanetId,
    primaryName: `Home ${n} Prime`,
    secondaryId: `pl:home-${n}-minor` as PlanetId,
    secondaryName: `Home ${n} Minor`
  }
}

/** Universe-map position for a home galaxy: spread on a circle around the centre Frontier. */
function galaxyLocation(index: number, total: number): { x: number, y: number } {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
  const radius = 32
  return {
    x: Math.round(50 + radius * Math.cos(angle)),
    y: Math.round(50 + radius * Math.sin(angle))
  }
}

/** Every planet type, in a fixed ring order so each system reads consistently. */
const ALL_TYPES: Planet['type'][] = ['terrestrial', 'oceanic', 'ice-giant', 'gas-giant', 'desert', 'barren']
const TYPE_SIZE: Record<Planet['type'], Planet['size']> = {
  'terrestrial': 'large',
  'oceanic': 'large',
  'ice-giant': 'medium',
  'gas-giant': 'huge',
  'desert': 'medium',
  'barren': 'small'
}

/** In-system position for a planet: spread the types evenly on a ring around the sun. */
function ringLocation(typeIndex: number): { x: number, y: number } {
  const angle = (typeIndex / ALL_TYPES.length) * Math.PI * 2 - Math.PI / 2
  return {
    x: Math.round(50 + 30 * Math.cos(angle)),
    y: Math.round(50 + 30 * Math.sin(angle))
  }
}

type OwnedPlanetDef = { id: PlanetId, name: string, slots: PlanetSlotData[] }
type NeutralIdDef = { id: PlanetId, name: string }

/**
 * Build one planet of every type for a system (ring-arranged). `owned` supplies
 * an owned-planet override per type (stable id, name, starting buildings); types
 * in `stableNeutral` keep a fixed unclaimed id (so tests/links stay valid); any
 * remaining type becomes a generated unclaimed expansion target.
 */
function makeSystemPlanets(
  systemKey: string,
  systemId: SolarSystemId,
  systemName: string,
  owner: Planet['owner'],
  owned: Partial<Record<Planet['type'], OwnedPlanetDef>> = {},
  stableNeutral: Partial<Record<Planet['type'], NeutralIdDef>> = {}
): Planet[] {
  return ALL_TYPES.map((type, i) => {
    const location = ringLocation(i)
    const ownedDef = owned[type]
    if (ownedDef) {
      return {
        id: ownedDef.id,
        systemId,
        name: ownedDef.name,
        owner,
        type,
        size: TYPE_SIZE[type],
        workers: 1,
        productionPerWorker: 20,
        slots: ownedDef.slots,
        queues: { build: [], shipyard: [] },
        progressMemory: {},
        productionCarryover: 0,
        location
      }
    }
    const neutral = stableNeutral[type]
    return makeNeutralPlanet(
      neutral?.id ?? `pl:${systemKey}-${type}` as PlanetId,
      systemId,
      neutral?.name ?? `${systemName} ${type}`,
      type,
      TYPE_SIZE[type],
      location
    )
  })
}

/** An empty, unclaimed planet with an ore node — an expansion target worth taking. */
function makeNeutralPlanet(
  id: PlanetId,
  systemId: SolarSystemId,
  name: string,
  type: Planet['type'],
  size: Planet['size'],
  location: { x: number, y: number }
): Planet {
  return {
    id,
    systemId,
    name,
    owner: 'unclaimed',
    type,
    size,
    workers: 1,
    productionPerWorker: 20,
    slots: makeSlots([], new Map([[2, 'ore']])),
    queues: { build: [], shipyard: [] },
    progressMemory: {},
    productionCarryover: 0,
    location
  }
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

  const planets: Planet[] = []
  const systems: SolarSystem[] = []
  const galaxies: Galaxy[] = []
  const gatewaySystemIds: SolarSystemId[] = []

  players.forEach((player, index) => {
    const template = homeTemplate(index)
    const homeSystemId = `sys:${template.key}` as SolarSystemId
    const reachSystemId = `sys:${template.key}-reach` as SolarSystemId
    const gateSystemId = `sys:${template.key}-gate` as SolarSystemId
    const galaxyId = `galaxy:${template.key}` as Galaxy['id']
    gatewaySystemIds.push(gateSystemId)

    // Home system: every planet type, with the two named home worlds owned.
    const homePlanets = makeSystemPlanets(
      template.key, homeSystemId, template.systemName, player.id,
      {
        'terrestrial': {
          id: template.primaryId,
          name: template.primaryName,
          slots: makeSlots(
            [
              { id: 'bld:fusion-core' as BuildingId, level: 2 },
              { id: 'bld:hydroponics' as BuildingId, level: 3 },
              { id: 'bld:orbital-dock' as BuildingId, level: 1 },
              { id: 'bld:data-center' as BuildingId, level: 1 }
            ],
            new Map([[2, 'ore']])
          )
        },
        'ice-giant': {
          id: template.secondaryId,
          name: template.secondaryName,
          slots: makeSlots([
            { id: 'bld:refinery-node' as BuildingId, level: 1 },
            { id: 'bld:listening-post' as BuildingId, level: 1 }
          ])
        }
      }
    )
    player.planets = homePlanets.filter(p => p.owner === player.id).map(p => p.id)

    // Expansion targets inside the player's own galaxy — full type sets too.
    const reachPlanets = makeSystemPlanets(`${template.key}-reach`, reachSystemId, `${template.systemName} Reach`, 'unclaimed')
    const gatePlanets = makeSystemPlanets(`${template.key}-gate`, gateSystemId, `${template.systemName} Gate`, 'unclaimed')
    planets.push(...homePlanets, ...reachPlanets, ...gatePlanets)

    systems.push(
      { id: homeSystemId, name: template.systemName, intel: 'high', connections: [reachSystemId], planets: homePlanets.map(p => p.id), location: { x: 26, y: 50 } },
      { id: reachSystemId, name: `${template.systemName} Reach`, intel: 'medium', connections: [homeSystemId, gateSystemId], planets: reachPlanets.map(p => p.id), location: { x: 50, y: 50 } },
      { id: gateSystemId, name: `${template.systemName} Gate`, intel: 'medium', connections: [reachSystemId, FRONTIER_SYSTEM], planets: gatePlanets.map(p => p.id), location: { x: 74, y: 50 } }
    )

    galaxies.push({
      id: galaxyId,
      name: template.galaxyName,
      intel: 'high',
      connections: [FRONTIER_GALAXY],
      solarSystems: [homeSystemId, reachSystemId, gateSystemId],
      location: galaxyLocation(index, players.length)
    })
  })

  // Shared contested Frontier: every type, with the two named prizes kept stable.
  const frontierPlanets = makeSystemPlanets(
    'frontier', FRONTIER_SYSTEM, 'Frontier', 'unclaimed', {},
    {
      oceanic: { id: 'pl:frontier-alpha' as PlanetId, name: 'Frontier Alpha' },
      desert: { id: 'pl:frontier-beta' as PlanetId, name: 'Frontier Beta' }
    }
  )
  planets.push(...frontierPlanets)

  systems.push({
    id: FRONTIER_SYSTEM,
    name: 'The Frontier',
    intel: 'low',
    connections: [...gatewaySystemIds],
    planets: frontierPlanets.map(p => p.id),
    location: { x: 50, y: 50 }
  })

  galaxies.push({
    id: FRONTIER_GALAXY,
    name: 'The Frontier',
    intel: 'low',
    connections: galaxies.map(g => g.id),
    solarSystems: [FRONTIER_SYSTEM],
    location: { x: 50, y: 50 }
  })

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

import { toPlayerId } from './playerId'
import {
  TECH_DEFS
} from '~~/shared/defs/research-tree'
import { getBuildingDef } from '~~/shared/defs/production'
import type { BuildingId, GameSnapshot, Galaxy, Planet, PlanetSlotData, PlayerSnapshot, ResearchId, Resource, SolarSystem, ResourceNodeType } from '~~/shared/types/game'
import type { PlayerResearchState } from '~~/shared/types/research'
import { createPlanetSlots, ORBITAL_BUILDING_IDS } from '~~/shared/types/planetSlots'

function calculateResourceProduction(planets: Planet[], playerId: string): { energy: number, minerals: number, rare: number } {
  let energy = 0
  let minerals = 0
  let rare = 0

  for (const planet of planets) {
    if (planet.owner !== playerId) continue
    for (const slot of planet.slots) {
      if (!slot.buildingId || slot.isConstructing) continue
      const def = getBuildingDef(slot.buildingId)
      if (def?.resourceProduction) {
        const level = Math.max(1, slot.buildingLevel)
        energy += (def.resourceProduction.energy ?? 0) * level
        minerals += (def.resourceProduction.minerals ?? 0) * level
        rare += (def.resourceProduction.rare ?? 0) * level
      }
    }
  }

  return { energy, minerals, rare }
}

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

export function initialState(userIds: string[], turn = 1): GameSnapshot {
  const availableResearchIds = TECH_DEFS.filter(t => t.prerequisites.length === 0).map(t => t.id as ResearchId)
  const playerIds = userIds.map(userId => toPlayerId(userId))
  const primaryOwner = playerIds[0] ?? toPlayerId('unknown')
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
        planetsControlled: 1,
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

  const makeSlots = (
    buildings: Array<{ id: BuildingId, level: number }>,
    resourceNodes: Map<number, ResourceNodeType> = new Map()
  ): PlanetSlotData[] => {
    const slots = createPlanetSlots(resourceNodes)
    for (const { id, level } of buildings) {
      placeBuilding(slots, id, level)
    }
    return slots
  }

  const planets: Planet[] = [
    {
      id: 'pl:aurora',
      systemId: 'sys:lyra',
      name: 'Aurora Prime',
      owner: primaryOwner,
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
      id: 'pl:borealis',
      systemId: 'sys:lyra',
      name: 'Borealis',
      owner: primaryOwner,
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
    },
    {
      id: 'pl:nadir-outpost',
      systemId: 'sys:nadir',
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
    }
  ]

  const systems: SolarSystem[] = [
    {
      id: 'sys:lyra',
      name: 'Lyra',
      intel: 'high',
      connections: ['sys:nadir', 'sys:helix'],
      planets: ['pl:aurora', 'pl:borealis'],
      location: { x: 22, y: 35 }
    },
    {
      id: 'sys:nadir',
      name: 'Nadir',
      intel: 'medium',
      connections: ['sys:lyra'],
      planets: ['pl:nadir-outpost'],
      location: { x: 58, y: 48 }
    },
    {
      id: 'sys:helix',
      name: 'Helix',
      intel: 'low',
      connections: ['sys:lyra'],
      planets: [],
      location: { x: 42, y: 68 }
    }
  ]

  const galaxies: Galaxy[] = [
    {
      id: 'galaxy:aurora',
      name: 'Aurora',
      intel: 'high',
      connections: ['galaxy:veil'],
      solarSystems: ['sys:lyra', 'sys:nadir'],
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

  for (const player of players) {
    if (player.id === primaryOwner) {
      player.planets = planets.filter(planet => planet.owner === primaryOwner).map(planet => planet.id)
    }
    // Calculate initial resource deltas based on buildings
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

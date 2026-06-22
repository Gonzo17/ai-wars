import type { BuildingId, UnitId } from '../types/game'
import type { DistrictDef, DistrictType } from '../types/districts'

/**
 * Phase-2 district defs (STARTER set — Energy/Matter/Research/Production, the early
 * "first choice"). Demonstrates the agreed model:
 *  - cumulative output: a district's yield is the SUM of every node built in it;
 *  - branching: `branchGroup` siblings are mutually exclusive (pick one path);
 *  - energy: a district's BASE node is free infrastructure (no upkeep, basic yield);
 *    DEEPER nodes draw `energyUpkeep` per round (improving a district has a running
 *    cost). Energy is gross production minus upkeep; a build that would push net
 *    energy/round below zero is rejected.
 * Numbers are a first pass, kept near today's building values; the full tree content
 * (branches, the other 5 districts, megastructures) is fleshed out with the Phase-2
 * tech tree (2b). Node ids reuse existing building ids where one already fits.
 */

const b = (id: string): BuildingId => id as BuildingId

export const DISTRICT_DEFS: Record<DistrictType, DistrictDef> = {
  // ⚡ ENERGY — the substrate. Nodes PRODUCE energy/round (no upkeep); everything
  // else's upkeep is paid out of this. Strong on desert (solar) and gas-giant.
  energy: {
    type: 'energy',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'gas-giant'],
    zone: 'surface',
    weights: { 'desert': 1.3, 'gas-giant': 1.3, 'ice-giant': 0.9 },
    tree: [
      { id: b('bld:solar-array'), prereqIds: [], cost: { matter: 50 }, buildTime: 3, output: { energy: 20 } },
      // Reactor line — high steady output.
      { id: b('bld:fusion-core'), prereqIds: [b('bld:solar-array')], branchGroup: 'core', research: 'tech:planetary-grid-management', cost: { energy: 60, matter: 80 }, buildTime: 6, output: { energy: 50 } },
      // Relay line — boosts adjacency/grid instead of raw output (placeholder yield).
      { id: b('bld:power-relay'), prereqIds: [b('bld:solar-array')], branchGroup: 'core', research: 'tech:planetary-grid-management', cost: { energy: 40, matter: 70 }, buildTime: 5, output: { energy: 30 } }
    ]
  },

  // ⛏ MATTER — construction substrate. Consumer (light upkeep). Strong on barren/ice.
  matter: {
    type: 'matter',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'barren'],
    zone: 'surface',
    weights: { 'barren': 1.3, 'ice-giant': 1.2, 'oceanic': 0.9 },
    tree: [
      { id: b('bld:mining-facility'), prereqIds: [], cost: { energy: 30 }, buildTime: 3, output: { matter: 15 } },
      // Deep-core line — raw yield, but draws energy/round to run.
      { id: b('bld:refinery-node'), prereqIds: [b('bld:mining-facility')], branchGroup: 'extract', research: 'tech:basic-industrial-robotics', cost: { energy: 55, matter: 85 }, buildTime: 4, energyUpkeep: 8, output: { matter: 25 } }
    ]
  },

  // 🔬 RESEARCH — the only source of science (no per-planet base). The data center
  // houses the AI core, so it is the MANDATORY first build on a fresh planet (every
  // other district needs it to run). Cheap, energy-only, ONE round — surface, since a
  // research centre in orbit makes little sense. Base node is research-free to bootstrap.
  research: {
    type: 'research',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'gas-giant'],
    zone: 'surface',
    weights: { terrestrial: 1.2, oceanic: 1.2 },
    tree: [
      { id: b('bld:data-center'), prereqIds: [], cost: { energy: 50 }, buildTime: 1, output: { research: 20 } }
    ]
  },

  // 🏭 PRODUCTION — build throughput above BASE_PLANET_PRODUCTION (replaces workers).
  production: {
    type: 'production',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'barren', 'gas-giant'],
    zone: 'surface',
    tree: [
      { id: b('bld:assembler'), prereqIds: [], cost: { energy: 30, matter: 40 }, buildTime: 3, output: { production: 15 } },
      // Deeper automation boosts throughput but draws energy/round to run.
      { id: b('bld:robotics-bay'), prereqIds: [b('bld:assembler')], research: 'tech:basic-industrial-robotics', cost: { energy: 60, matter: 90 }, buildTime: 5, energyUpkeep: 12, output: { production: 30 } }
    ]
  },

  // 🚀 SHIPYARD — the orbital dock that lets a planet build ships. Founding it IS the
  // orbital dock (units list under this district and require it). Gated by first-shipyard.
  shipyard: {
    type: 'shipyard',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'gas-giant', 'barren'],
    zone: 'orbital',
    tree: [
      { id: b('bld:orbital-dock'), prereqIds: [], research: 'tech:first-shipyard', cost: { energy: 90, matter: 110 }, buildTime: 4, output: {} }
    ]
  },

  // ── Stubs (filled in 2b with the tech tree) ──────────────────────────
  defense: { type: 'defense', availableOn: [], zone: 'orbital', tree: [] },
  rare: { type: 'rare', availableOn: [], zone: 'surface', tree: [] },
  exotic: { type: 'exotic', availableOn: [], zone: 'surface', tree: [] },
  antimatter: { type: 'antimatter', availableOn: [], zone: 'surface', tree: [] }
}

export const getDistrictDef = (type: DistrictType): DistrictDef => DISTRICT_DEFS[type]

/** Find the district def + node def that defines a given node (building) id. */
export function findDistrictNode(nodeId: BuildingId) {
  for (const def of Object.values(DISTRICT_DEFS)) {
    const node = def.tree.find(n => n.id === nodeId)
    if (node) return { district: def, node }
  }
  return undefined
}

/** Which districts a planet of this type may open. */
export function districtsForPlanetType(type: DistrictDef['availableOn'][number]): DistrictDef[] {
  return Object.values(DISTRICT_DEFS).filter(d => d.availableOn.includes(type))
}

/** The district a unit is built from. All ships come from the Shipyard for now. */
export function unitDistrict(_unitId: UnitId | string): DistrictType {
  return 'shipyard'
}

import type { BuildingId, UnitId } from '../types/game'
import type { DistrictDef, DistrictType } from '../types/districts'

/**
 * Phase-2 district defs (STARTER set — Energy/Matter/Research/Production, the early
 * "first choice"). Demonstrates the agreed model:
 *  - cumulative output: a district's yield is the SUM of every node built in it;
 *  - branching: `branchGroup` siblings are mutually exclusive (pick one path);
 *  - costs are one-time only (no running upkeep) — keep it simple.
 * Numbers are a first pass, kept near today's building values; the full tree content
 * (branches, the other 5 districts, megastructures) is fleshed out with the Phase-2
 * tech tree (2b). Node ids reuse existing building ids where one already fits.
 */

const b = (id: string): BuildingId => id as BuildingId

export const DISTRICT_DEFS: Record<DistrictType, DistrictDef> = {
  // ⚡ ENERGY — the substrate. Nodes PRODUCE energy/round. Strong on desert (solar)
  // and gas-giant.
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

  // ⛏ MATTER — construction substrate. Strong on barren/ice.
  matter: {
    type: 'matter',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'barren'],
    zone: 'surface',
    weights: { 'barren': 1.3, 'ice-giant': 1.2, 'oceanic': 0.9 },
    tree: [
      { id: b('bld:mining-facility'), prereqIds: [], cost: { energy: 30 }, buildTime: 3, output: { matter: 15 } },
      // Deep-core line — raw yield.
      { id: b('bld:refinery-node'), prereqIds: [b('bld:mining-facility')], branchGroup: 'extract', research: 'tech:basic-industrial-robotics', cost: { energy: 55, matter: 85 }, buildTime: 4, output: { matter: 25 } }
    ]
  },

  // 🔬 RESEARCH — the source of science. The data center houses the AI core, so it is
  // the MANDATORY first build on a fresh planet (every other district needs it). Cheap,
  // energy-only, ONE round — surface, since a research centre in orbit makes little
  // sense. It also produces a little PRODUCTION (the planet's base build throughput,
  // surfaced here instead of being a hidden flat bonus), so a fresh planet can build
  // without being forced to open a Production district first.
  research: {
    type: 'research',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'gas-giant'],
    zone: 'surface',
    weights: { terrestrial: 1.2, oceanic: 1.2 },
    tree: [
      { id: b('bld:data-center'), prereqIds: [], cost: { energy: 50 }, buildTime: 1, output: { research: 20, production: 20 } }
    ]
  },

  // 🏭 PRODUCTION (Fabrikkomplex) — build throughput on top of the data center's base.
  // The district itself is unlocked by Industrial Robotics; the deeper Roboterwerk by the
  // Mass Production doctrine.
  production: {
    type: 'production',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'barren', 'gas-giant'],
    zone: 'surface',
    research: 'tech:basic-industrial-robotics',
    tree: [
      { id: b('bld:assembler'), prereqIds: [], cost: { energy: 30, matter: 40 }, buildTime: 3, output: { production: 15 } },
      { id: b('bld:robotics-bay'), prereqIds: [b('bld:assembler')], research: 'tech:mass-production', cost: { energy: 60, matter: 90 }, buildTime: 5, output: { production: 30 } }
    ]
  },

  // 🚀 SHIPYARD (Orbitale Werft) — the orbital dock that lets a planet build ships.
  // Founding it IS the orbital dock (units list under it). Unlocked by Orbital Engineering.
  shipyard: {
    type: 'shipyard',
    availableOn: ['terrestrial', 'oceanic', 'desert', 'ice-giant', 'gas-giant', 'barren'],
    zone: 'orbital',
    research: 'tech:orbital-engineering',
    tree: [
      { id: b('bld:orbital-dock'), prereqIds: [], cost: { energy: 90, matter: 110 }, buildTime: 4, output: {} }
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

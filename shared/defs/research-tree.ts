import type { TechDef, AscensionGateDef } from '../types/research'

/**
 * Phase-2 tech tree (see docs/tech-tree-phase2.md). Unlocks-first: a tech opens real
 * things (the buildings/units/districts that list it in `requirements.research`, plus the
 * abilities/visibilities and output buffs in `effects`). Three doctrine forks
 * (`bootstrap`/`strategic`/`stellar`) are mutually exclusive. The ladder is convergent up
 * to k2.0 = HOLD A STAR (everyone's goal — stellar structures unlock there), then it fans
 * out; k3.0 is the win, not a research tier (so it holds no techs).
 */
export const TECH_DEFS: TechDef[] = [
  // ===== k0.6 FOUNDATION (3) =====
  {
    id: 'tech:bootstrapped-ai-core', name: 'Bootstrapped AI Core', category: 'energy_compute', tier: 'k0.6',
    prerequisites: [], researchPoints: 60,
    effects: [{ kind: 'resourceMult', resource: 'research', mult: 1.1 }]
  },
  {
    id: 'tech:planetary-grid-management', name: 'Planetary Grid Management', category: 'energy_compute', tier: 'k0.6',
    prerequisites: ['tech:bootstrapped-ai-core'], researchPoints: 100,
    effects: [{ kind: 'resourceMult', resource: 'energy', mult: 1.15 }]
  },
  {
    id: 'tech:basic-industrial-robotics', name: 'Industrial Robotics', category: 'economy_industry', tier: 'k0.6',
    prerequisites: ['tech:bootstrapped-ai-core'], researchPoints: 100,
    effects: [{ kind: 'resourceMult', resource: 'production', mult: 1.1 }]
  },

  // ===== k0.8 AUTOMATION (4) — ★ bootstrap doctrine =====
  {
    id: 'tech:orbital-engineering', name: 'Orbital Engineering', category: 'exploration_navigation', tier: 'k0.8',
    prerequisites: ['tech:bootstrapped-ai-core'], researchPoints: 140,
    effects: [{ kind: 'ability', flag: 'survey:system' }]
  },
  {
    id: 'tech:mass-production', name: 'Mass Production', category: 'economy_industry', tier: 'k0.8',
    prerequisites: ['tech:basic-industrial-robotics'], researchPoints: 200, doctrineGroup: 'bootstrap',
    effects: [{ kind: 'resourceMult', resource: 'production', mult: 1.2 }]
  },
  {
    id: 'tech:deep-research', name: 'Deep Research', category: 'energy_compute', tier: 'k0.8',
    prerequisites: ['tech:planetary-grid-management'], researchPoints: 200, doctrineGroup: 'bootstrap',
    effects: [{ kind: 'resourceMult', resource: 'research', mult: 1.25 }]
  },
  {
    id: 'tech:autonomous-resource-allocation', name: 'Autonomous Resource Allocation', category: 'economy_industry', tier: 'k0.8',
    prerequisites: ['tech:basic-industrial-robotics'], researchPoints: 220,
    effects: [{ kind: 'resourceMult', resource: 'minerals', mult: 1.15 }]
  },

  // ===== k1.0 DOMINION (5) =====
  {
    id: 'tech:colony-ship-design', name: 'Colony Ship Design', category: 'colonization_planettypes', tier: 'k1.0',
    prerequisites: ['tech:orbital-engineering'], researchPoints: 280,
    effects: [{ kind: 'ability', flag: 'colonize:terrestrial' }, { kind: 'ability', flag: 'colonize:oceanic' }]
  },
  {
    id: 'tech:exotic-matter-survey', name: 'Exotic Matter Survey', category: 'exploration_navigation', tier: 'k1.0',
    prerequisites: ['tech:orbital-engineering'], researchPoints: 300,
    effects: [{ kind: 'ability', flag: 'survey:exotic' }]
  },
  {
    id: 'tech:data-center-ii', name: 'Neural Lattice', category: 'energy_compute', tier: 'k1.0',
    prerequisites: ['tech:bootstrapped-ai-core'], researchPoints: 300,
    effects: [{ kind: 'resourceMult', resource: 'research', mult: 1.2 }]
  },
  {
    id: 'tech:combat-ai', name: 'Combat AI', category: 'military_defense', tier: 'k1.0',
    prerequisites: ['tech:data-center-ii'], researchPoints: 280
  },
  {
    id: 'tech:planetwide-infrastructure', name: 'Planetwide Infrastructure', category: 'economy_industry', tier: 'k1.0',
    prerequisites: ['tech:autonomous-resource-allocation'], researchPoints: 320,
    effects: [{ kind: 'resourceMult', resource: 'production', mult: 1.15 }]
  },

  // ===== k1.5 HEGEMONY (7) — ★ strategic doctrine; star-constructor unlocks here =====
  {
    id: 'tech:expansionist', name: 'Expansionist Doctrine', category: 'colonization_planettypes', tier: 'k1.5',
    prerequisites: ['tech:colony-ship-design'], researchPoints: 420, doctrineGroup: 'strategic',
    effects: [
      { kind: 'ability', flag: 'colonize:barren' },
      { kind: 'ability', flag: 'colonize:desert' },
      { kind: 'ability', flag: 'colonize:ice-giant' }
    ]
  },
  {
    id: 'tech:entrenchment', name: 'Entrenchment Doctrine', category: 'military_defense', tier: 'k1.5',
    prerequisites: ['tech:combat-ai'], researchPoints: 420, doctrineGroup: 'strategic'
  },
  {
    id: 'tech:stellar-cartography', name: 'Stellar Cartography', category: 'exploration_navigation', tier: 'k1.5',
    prerequisites: ['tech:exotic-matter-survey'], researchPoints: 450,
    effects: [{ kind: 'ability', flag: 'capture:star' }]
  },
  {
    id: 'tech:orbital-shipyard', name: 'Orbital Shipyard', category: 'economy_industry', tier: 'k1.5',
    prerequisites: ['tech:planetwide-infrastructure'], researchPoints: 450
  },
  {
    id: 'tech:orbital-fabricators', name: 'Orbital Fabricators', category: 'economy_industry', tier: 'k1.5',
    prerequisites: ['tech:orbital-shipyard'], researchPoints: 500
  },
  {
    id: 'tech:ai-governor-systems', name: 'AI Governor Systems', category: 'energy_compute', tier: 'k1.5',
    prerequisites: ['tech:planetwide-infrastructure'], researchPoints: 480,
    effects: [
      { kind: 'resourceMult', resource: 'energy', mult: 1.1 },
      { kind: 'resourceMult', resource: 'minerals', mult: 1.1 },
      { kind: 'resourceMult', resource: 'research', mult: 1.1 }
    ]
  },
  {
    id: 'tech:fleet-coordination', name: 'Fleet Coordination', category: 'military_defense', tier: 'k1.5',
    prerequisites: ['tech:combat-ai'], researchPoints: 450
  },

  // ===== k2.0 STELLAR MASTERY (10) — ★ stellar doctrine; star structures & units unlock =====
  {
    id: 'tech:stellar-energy-capture', name: 'Stellar Energy Capture', category: 'energy_compute', tier: 'k2.0',
    prerequisites: ['tech:orbital-fabricators', 'tech:stellar-cartography'], researchPoints: 600
  },
  {
    id: 'tech:dyson-swarm', name: 'Dyson Swarm', category: 'energy_compute', tier: 'k2.0',
    prerequisites: ['tech:stellar-energy-capture'], researchPoints: 800, doctrineGroup: 'stellar',
    effects: [{ kind: 'resourceMult', resource: 'energy', mult: 1.3 }]
  },
  {
    id: 'tech:matrioshka-brain', name: 'Matrioshka Brain', category: 'energy_compute', tier: 'k2.0',
    prerequisites: ['tech:stellar-energy-capture'], researchPoints: 800, doctrineGroup: 'stellar',
    effects: [{ kind: 'resourceMult', resource: 'research', mult: 1.5 }]
  },
  {
    id: 'tech:stellar-computation', name: 'Stellar Computation', category: 'energy_compute', tier: 'k2.0',
    prerequisites: ['tech:stellar-energy-capture'], researchPoints: 700,
    effects: [{ kind: 'resourceMult', resource: 'research', mult: 1.3 }]
  },
  {
    id: 'tech:antimatter-containment', name: 'Antimatter Containment', category: 'energy_compute', tier: 'k2.0',
    prerequisites: ['tech:stellar-energy-capture'], researchPoints: 700,
    effects: [{ kind: 'ability', flag: 'survey:antimatter' }]
  },
  {
    id: 'tech:mega-shipyard', name: 'Mega Shipyard', category: 'economy_industry', tier: 'k2.0',
    prerequisites: ['tech:orbital-fabricators'], researchPoints: 650
  },
  {
    id: 'tech:system-defense-network', name: 'System Defense Network', category: 'military_defense', tier: 'k2.0',
    prerequisites: ['tech:fleet-coordination'], researchPoints: 600
  },
  {
    id: 'tech:system-wide-shields', name: 'System-Wide Shields', category: 'military_defense', tier: 'k2.0',
    prerequisites: ['tech:system-defense-network'], researchPoints: 650
  },
  {
    id: 'tech:dreadnought-doctrine', name: 'Dreadnought Doctrine', category: 'military_defense', tier: 'k2.0',
    prerequisites: ['tech:fleet-coordination'], researchPoints: 650
  },
  {
    id: 'tech:temporal-ascension-i', name: 'Temporal Ascension Engine I', category: 'energy_compute', tier: 'k2.0',
    prerequisites: ['tech:stellar-computation'], researchPoints: 900
  },

  // ===== k2.3 INTERSTELLAR (6) =====
  {
    id: 'tech:interstellar-probe', name: 'Interstellar Probe', category: 'exploration_navigation', tier: 'k2.3',
    prerequisites: ['tech:stellar-energy-capture'], researchPoints: 800
  },
  {
    id: 'tech:generation-ship', name: 'Generation Ship', category: 'colonization_planettypes', tier: 'k2.3',
    prerequisites: ['tech:interstellar-probe'], researchPoints: 1000,
    effects: [{ kind: 'ability', flag: 'colonize:cross-galaxy' }]
  },
  {
    id: 'tech:temporal-ascension-ii', name: 'Temporal Ascension Engine II', category: 'energy_compute', tier: 'k2.3',
    prerequisites: ['tech:temporal-ascension-i'], researchPoints: 1400
  },
  {
    id: 'tech:galactic-logistics', name: 'Galactic Logistics', category: 'economy_industry', tier: 'k2.3',
    prerequisites: ['tech:orbital-fabricators'], researchPoints: 900,
    effects: [{ kind: 'resourceMult', resource: 'production', mult: 1.25 }]
  },
  {
    id: 'tech:planet-cracker', name: 'Planet Cracker', category: 'military_defense', tier: 'k2.3',
    prerequisites: ['tech:dreadnought-doctrine'], researchPoints: 1100,
    effects: [{ kind: 'ability', flag: 'planet-cracker' }]
  },
  {
    id: 'tech:galactic-network', name: 'Galactic Network', category: 'exploration_navigation', tier: 'k2.3',
    prerequisites: ['tech:interstellar-probe'], researchPoints: 900,
    effects: [{ kind: 'ability', flag: 'intel:galactic' }]
  }
]

/**
 * Each gate = required techs + an empire condition (research fused with expansion). k2.0 =
 * hold a star (the universal milestone), k3.0 = hold the galaxy (= the expansion win, so
 * k3.0 is reached, not researched). planetsControlled survives only as the tiny first gate.
 */
export const ASCENSION_GATES: AscensionGateDef[] = [
  {
    toTier: 'k0.8',
    requiresTech: ['tech:planetary-grid-management', 'tech:basic-industrial-robotics'],
    requiresCompute: 0
  },
  {
    toTier: 'k1.0',
    requiresTech: ['tech:orbital-engineering', 'tech:autonomous-resource-allocation'],
    requiresCompute: 0,
    requiresEmpire: { planetsControlled: 2 }
  },
  {
    toTier: 'k1.5',
    requiresTech: ['tech:colony-ship-design', 'tech:combat-ai', 'tech:planetwide-infrastructure'],
    requiresCompute: 0,
    requiresEmpire: { homeSystemMajority: true }
  },
  {
    toTier: 'k2.0',
    requiresTech: ['tech:stellar-cartography', 'tech:orbital-fabricators', 'tech:ai-governor-systems'],
    requiresCompute: 0,
    requiresEmpire: { starsControlled: 1 }
  },
  {
    toTier: 'k2.3',
    requiresTech: ['tech:stellar-energy-capture', 'tech:stellar-computation'],
    requiresCompute: 0,
    requiresEmpire: { starsControlled: 1, galaxyStarFraction: 0.5 }
  },
  {
    toTier: 'k3.0',
    requiresTech: ['tech:generation-ship', 'tech:temporal-ascension-ii'],
    requiresCompute: 0,
    requiresEmpire: { galaxyStarFraction: 0.9 }
  }
]

export function getTechById(id: string): TechDef | undefined {
  return TECH_DEFS.find(t => t.id === id)
}

export function getTechsByTier(tier: string): TechDef[] {
  return TECH_DEFS.filter(t => t.tier === tier)
}

export function getGateForTier(tier: string): AscensionGateDef | undefined {
  return ASCENSION_GATES.find(g => g.toTier === tier)
}

import type { TechDef, AscensionGateDef } from '../types/research'

export const TECH_DEFS: TechDef[] = [
  // ============================================
  // K0.6 FOUNDATION - Starting tier (6 techs)
  // Clean tree: Core AI -> 3 branches (Energy, Industry, Exploration)
  // ============================================
  {
    id: 'tech:bootstrapped-ai-core',
    name: 'Bootstrapped AI Core',
    description: 'The nascent intelligence that guides all operations.',
    category: 'energy_compute',
    tier: 'k0.6',
    prerequisites: [],
    researchPoints: 60
  },
  {
    id: 'tech:basic-industrial-robotics',
    name: 'Basic Industrial Robotics',
    description: 'Automated manufacturing arms and assembly units.',
    category: 'economy_industry',
    tier: 'k0.6',
    prerequisites: ['tech:bootstrapped-ai-core'],
    researchPoints: 120
  },
  {
    id: 'tech:planetary-grid-management',
    name: 'Planetary Grid Management',
    description: 'Unified power distribution across surface installations.',
    category: 'energy_compute',
    tier: 'k0.6',
    prerequisites: ['tech:bootstrapped-ai-core'],
    researchPoints: 120
  },
  {
    id: 'tech:probe-design',
    name: 'Probe Design',
    description: 'Autonomous scout probes for system exploration.',
    category: 'exploration_navigation',
    tier: 'k0.6',
    prerequisites: ['tech:bootstrapped-ai-core'],
    researchPoints: 120
  },
  {
    id: 'tech:first-shipyard',
    name: 'First Shipyard',
    description: 'Orbital construction facility for vessels.',
    category: 'economy_industry',
    tier: 'k0.6',
    prerequisites: ['tech:basic-industrial-robotics'],
    researchPoints: 180
  },
  {
    id: 'tech:data-center-i',
    name: 'Data Center I',
    description: 'Compute infrastructure backbone. Enables advanced research.',
    category: 'energy_compute',
    tier: 'k0.6',
    prerequisites: ['tech:planetary-grid-management'],
    researchPoints: 180
  },

  // ============================================
  // K0.8 PLANETARY AUTOMATION (7 techs)
  // Branches merge and split again
  // ============================================
  {
    id: 'tech:autonomous-resource-allocation',
    name: 'Autonomous Resource Allocation',
    description: 'AI-driven supply chain optimization.',
    category: 'economy_industry',
    tier: 'k0.8',
    prerequisites: ['tech:basic-industrial-robotics', 'tech:data-center-i'],
    researchPoints: 300
  },
  {
    id: 'tech:deep-system-scan',
    name: 'Deep System Scan',
    description: 'Comprehensive mapping of orbital bodies and resources.',
    category: 'exploration_navigation',
    tier: 'k0.8',
    prerequisites: ['tech:probe-design'],
    researchPoints: 300
  },
  {
    id: 'tech:navigation-algorithms',
    name: 'Navigation Algorithms',
    description: 'Optimal trajectory calculations for interplanetary travel.',
    category: 'exploration_navigation',
    tier: 'k0.8',
    prerequisites: ['tech:deep-system-scan'],
    researchPoints: 200
  },
  {
    id: 'tech:habitation-modules',
    name: 'Habitation Modules',
    description: 'Self-contained environments for colony establishment.',
    category: 'colonization_planettypes',
    tier: 'k0.8',
    prerequisites: ['tech:first-shipyard'],
    researchPoints: 300
  },
  {
    id: 'tech:colony-ship-design',
    name: 'Colony Ship Design',
    description: 'Vessel capable of establishing new planetary outposts.',
    category: 'colonization_planettypes',
    tier: 'k0.8',
    prerequisites: ['tech:habitation-modules', 'tech:navigation-algorithms'],
    researchPoints: 400
  },
  {
    id: 'tech:data-center-ii',
    name: 'Data Center II',
    description: 'Expanded compute capacity for complex operations.',
    category: 'energy_compute',
    tier: 'k0.8',
    prerequisites: ['tech:data-center-i'],
    researchPoints: 400
  },
  {
    id: 'tech:efficient-thrusters',
    name: 'Efficient Thrusters',
    description: 'Improved propulsion systems for extended range.',
    category: 'exploration_navigation',
    tier: 'k0.8',
    prerequisites: ['tech:first-shipyard'],
    researchPoints: 300
  },
  // ============================================
  // K1.0 PLANETARY DOMINION (5 techs)
  // Military branch emerges, infrastructure consolidates
  // ============================================
  {
    id: 'tech:planetwide-infrastructure',
    name: 'Planetwide Infrastructure',
    description: 'Global logistics and manufacturing network.',
    category: 'economy_industry',
    tier: 'k1.0',
    prerequisites: ['tech:autonomous-resource-allocation'],
    researchPoints: 400
  },
  {
    id: 'tech:orbital-shipyard',
    name: 'Orbital Shipyard',
    description: 'Large-scale construction facility for capital ships.',
    category: 'economy_industry',
    tier: 'k1.0',
    prerequisites: ['tech:planetwide-infrastructure', 'tech:efficient-thrusters'],
    researchPoints: 500
  },
  {
    id: 'tech:combat-ai',
    name: 'Combat AI',
    description: 'Advanced fire control and threat assessment.',
    category: 'military_defense',
    tier: 'k1.0',
    prerequisites: ['tech:data-center-ii'],
    researchPoints: 300
  },
  {
    id: 'tech:fleet-coordination',
    name: 'Fleet Coordination',
    description: 'Synchronized multi-vessel tactical operations.',
    category: 'military_defense',
    tier: 'k1.0',
    prerequisites: ['tech:combat-ai', 'tech:navigation-algorithms'],
    researchPoints: 400
  },
  {
    id: 'tech:shield-generators',
    name: 'Shield Generators',
    description: 'Energy barriers for critical installations.',
    category: 'military_defense',
    tier: 'k1.0',
    prerequisites: ['tech:combat-ai'],
    researchPoints: 400
  },
  {
    id: 'tech:exotic-matter-survey',
    name: 'Exotic Matter Survey',
    description: 'Reveals exotic-matter deposits and unlocks their extraction. A strategic resource needed for megastructures.',
    category: 'exploration_navigation',
    tier: 'k1.0',
    prerequisites: ['tech:deep-system-scan'],
    researchPoints: 350
  },

  // ============================================
  // K1.5 SYSTEM HEGEMONY (5 techs)
  // System-wide control, multi-planet operations
  // ============================================
  {
    id: 'tech:orbital-mining',
    name: 'Orbital Mining',
    description: 'Automated extraction from asteroids and moons.',
    category: 'economy_industry',
    tier: 'k1.5',
    prerequisites: ['tech:planetwide-infrastructure', 'tech:efficient-thrusters'],
    researchPoints: 400
  },
  {
    id: 'tech:orbital-fabricators',
    name: 'Orbital Fabricators',
    description: 'Zero-gravity manufacturing for massive structures.',
    category: 'economy_industry',
    tier: 'k1.5',
    prerequisites: ['tech:orbital-shipyard', 'tech:orbital-mining'],
    researchPoints: 500
  },
  {
    id: 'tech:ai-governor-systems',
    name: 'AI Governor Systems',
    description: 'Autonomous planetary administration.',
    category: 'energy_compute',
    tier: 'k1.5',
    prerequisites: ['tech:planetwide-infrastructure', 'tech:data-center-ii'],
    researchPoints: 500
  },
  {
    id: 'tech:data-center-iii',
    name: 'Data Center III',
    description: 'Distributed compute clusters across system bodies.',
    category: 'energy_compute',
    tier: 'k1.5',
    prerequisites: ['tech:ai-governor-systems'],
    researchPoints: 500
  },
  {
    id: 'tech:system-defense-network',
    name: 'System Defense Network',
    description: 'Coordinated defensive installations across the system.',
    category: 'military_defense',
    tier: 'k1.5',
    prerequisites: ['tech:shield-generators', 'tech:fleet-coordination'],
    researchPoints: 500
  },

  // ============================================
  // K2.0 STELLAR MASTERY (4 techs)
  // Dyson swarm, stellar-scale operations
  // ============================================
  {
    id: 'tech:stellar-energy-capture',
    name: 'Stellar Energy Capture',
    description: 'Direct harvesting of solar output.',
    category: 'energy_compute',
    tier: 'k2.0',
    prerequisites: ['tech:orbital-fabricators', 'tech:data-center-iii'],
    researchPoints: 600,
    requires: { empire: { homeSystemMajority: true } }
  },
  {
    id: 'tech:dyson-swarm',
    name: 'Dyson Swarm',
    description: 'Star-enclosing megastructure for energy collection.',
    category: 'energy_compute',
    tier: 'k2.0',
    prerequisites: ['tech:stellar-energy-capture'],
    researchPoints: 800
  },
  {
    id: 'tech:stellar-computation',
    name: 'Stellar Computation',
    description: 'Processing centers powered by stellar energy.',
    category: 'energy_compute',
    tier: 'k2.0',
    prerequisites: ['tech:dyson-swarm'],
    researchPoints: 600
  },
  {
    id: 'tech:antimatter-containment',
    name: 'Antimatter Containment',
    description: 'Magnetic traps reveal antimatter deposits and unlock their collection — fuel for capital ships.',
    category: 'energy_compute',
    tier: 'k2.0',
    prerequisites: ['tech:stellar-energy-capture'],
    researchPoints: 700
  },
  {
    id: 'tech:system-wide-shields',
    name: 'System-Wide Shields',
    description: 'Defensive barriers protecting entire orbital regions.',
    category: 'military_defense',
    tier: 'k2.0',
    prerequisites: ['tech:system-defense-network', 'tech:stellar-energy-capture'],
    researchPoints: 700
  },

  // ============================================
  // K2.3 INTERSTELLAR DAWN (2 techs)
  // First steps beyond home system
  // ============================================
  {
    id: 'tech:interstellar-probe',
    name: 'Interstellar Probe',
    description: 'Scout capable of reaching nearby star systems.',
    category: 'exploration_navigation',
    tier: 'k2.3',
    prerequisites: ['tech:stellar-energy-capture', 'tech:orbital-fabricators'],
    researchPoints: 800
  },
  {
    id: 'tech:generation-ship',
    name: 'Generation Ship',
    description: 'Self-sustaining vessel for interstellar colonization.',
    category: 'colonization_planettypes',
    tier: 'k2.3',
    prerequisites: ['tech:interstellar-probe', 'tech:ai-governor-systems'],
    researchPoints: 1200
  },

  // ============================================
  // K3.0 ENDGAME (1 tech)
  // Final victory condition
  // ============================================
  {
    id: 'tech:galactic-network',
    name: 'Galactic Network',
    description: 'Communication across stellar distances.',
    category: 'energy_compute',
    tier: 'k3.0',
    prerequisites: ['tech:generation-ship', 'tech:stellar-computation'],
    researchPoints: 2000
  }
]

export const ASCENSION_GATES: AscensionGateDef[] = [
  {
    toTier: 'k0.8',
    requiresTech: [
      'tech:data-center-i',
      'tech:first-shipyard',
      'tech:probe-design'
    ],
    requiresCompute: 0
  },
  {
    toTier: 'k1.0',
    requiresTech: [
      'tech:data-center-ii',
      'tech:colony-ship-design',
      'tech:autonomous-resource-allocation'
    ],
    requiresCompute: 0,
    // Minimal "you've colonized once" floor — the only gate that still reads a planet count.
    requiresEmpire: {
      planetsControlled: 2
    }
  },
  {
    toTier: 'k1.5',
    requiresTech: [
      'tech:planetwide-infrastructure',
      'tech:orbital-shipyard',
      'tech:fleet-coordination'
    ],
    requiresCompute: 0,
    // Hold your whole home system before expanding outward.
    requiresEmpire: {
      homeSystemMajority: true
    }
  },
  {
    toTier: 'k2.0',
    requiresTech: [
      'tech:ai-governor-systems',
      'tech:data-center-iii',
      'tech:orbital-fabricators'
    ],
    requiresCompute: 0,
    // K2.0 = HOLD A STAR. The universal milestone: only on a captured star do the stellar
    // structures & units unlock. The star-constructor unlocks at k1.5, so the capture
    // itself is the gate (no Dyson needed yet — that's a k2.0 activity).
    requiresEmpire: {
      starsControlled: 1
    }
  },
  {
    toTier: 'k2.3',
    requiresTech: [
      'tech:stellar-computation',
      'tech:dyson-swarm'
    ],
    requiresCompute: 0,
    // Post-star expansion: still holding a star and grown to half your home galaxy.
    requiresEmpire: {
      starsControlled: 1,
      galaxyStarFraction: 0.5
    }
  },
  {
    toTier: 'k3.0',
    requiresTech: [
      'tech:generation-ship',
      'tech:stellar-computation'
    ],
    requiresCompute: 0,
    // K3.0 = HOLD THE GALAXY. This threshold IS the expansion win (see resolve/victory.ts);
    // reaching k3.0 means the game is over. Not a research tier.
    requiresEmpire: {
      galaxyStarFraction: 0.9
    }
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

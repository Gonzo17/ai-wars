export type AscensionTier = 'k0.6' | 'k0.8' | 'k1.0' | 'k1.5' | 'k2.0' | 'k2.3' | 'k3.0'

export type ResearchCategory
  = 'economy_industry'
    | 'energy_compute'
    | 'exploration_navigation'
    | 'colonization_planettypes'
    | 'military_defense'

export type TechStatus = 'completed' | 'researching' | 'available' | 'locked'

/**
 * What a tech grants BESIDES the buildings/units it unlocks (those are expressed on the
 * defs via `requirements.research`, derived for display). Effects carry the things that
 * aren't a def: gameplay abilities/visibilities (`ability`) and output buffs that ride
 * alongside an unlock (`resourceMult`). Unlocks-first: a tech should never be ONLY a buff.
 */
export type TechEffect
  = { kind: 'ability', flag: string }
    | { kind: 'resourceMult', resource: 'energy' | 'minerals' | 'research' | 'production', mult: number }

export interface TechDef {
  id: string
  name: string
  description?: string
  category: ResearchCategory
  tier: AscensionTier
  prerequisites: string[]
  researchPoints?: number
  /** Mutually-exclusive doctrine group: completing one tech here locks its siblings. */
  doctrineGroup?: string
  /** Abilities/visibilities + output buffs this tech grants (unlocks live on the defs). */
  effects?: TechEffect[]
  requires?: {
    ascension?: AscensionTier
    compute?: number
    empire?: EmpireRequirement
  }
}

export interface EmpireRequirement {
  /** Minimal early "you've colonized once" floor — kept ONLY for the first gate. The
   *  bigger mid/late territory gates use `galaxyStarFraction` instead. */
  planetsControlled?: number
  homeSystemMajority?: boolean
  intelLevel?: 'low' | 'medium' | 'high'
  /** Captured stars required (stellar progression — K2.0 onward). */
  starsControlled?: number
  /** Highest Dyson-sphere stage built on any owned star. */
  dysonStages?: number
  /** Share (0..1) of the player's OWN home-galaxy stars they must hold (expansion gate). */
  galaxyStarFraction?: number
}

export interface AscensionGateDef {
  toTier: AscensionTier
  requiresTech: string[]
  requiresCompute: number
  requiresEmpire?: EmpireRequirement
}

export interface ActiveResearch {
  techId: string
  startedAt: number
  progressPoints: number
}

export interface PlayerResearchState {
  ascensionTierReached: AscensionTier
  computeLevel: number
  empireState: {
    planetsControlled: number
    homeSystemMajority: boolean
    intelLevel: 'low' | 'medium' | 'high'
    starsControlled: number
    dysonStages: number
    /** Share (0..1) of the player's home-galaxy stars currently held. */
    galaxyStarFraction: number
  }
  completedTechIds: string[]
  activeResearch?: ActiveResearch
  progressMemory: Record<string, number>
}

export interface TechLockedReason {
  type: 'prerequisite' | 'ascension' | 'compute' | 'empire'
  message: string
  value?: string | number
  required?: string | number
}

export const ASCENSION_TIER_ORDER: AscensionTier[] = ['k0.6', 'k0.8', 'k1.0', 'k1.5', 'k2.0', 'k2.3', 'k3.0']

export const ASCENSION_TIER_LABELS: Record<AscensionTier, string> = {
  'k0.6': 'K0.6 Foundation',
  'k0.8': 'K0.8 Planetary Automation',
  'k1.0': 'K1.0 Planetary Dominion',
  'k1.5': 'K1.5 System Hegemony',
  'k2.0': 'K2.0 Stellar Mastery',
  'k2.3': 'K2.3 Interstellar Dawn',
  'k3.0': 'K3.0 Endgame'
}

export const RESEARCH_CATEGORY_ICONS: Record<ResearchCategory, string> = {
  economy_industry: 'i-lucide-factory',
  energy_compute: 'i-lucide-cpu',
  exploration_navigation: 'i-lucide-compass',
  colonization_planettypes: 'i-lucide-globe',
  military_defense: 'i-lucide-shield'
}

export const RESEARCH_CATEGORY_COLORS: Record<ResearchCategory, string> = {
  economy_industry: 'amber',
  energy_compute: 'cyan',
  exploration_navigation: 'violet',
  colonization_planettypes: 'emerald',
  military_defense: 'rose'
}

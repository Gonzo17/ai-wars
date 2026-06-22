import type {
  AscensionTier,
  TechDef,
  TechStatus,
  TechLockedReason,
  ActiveResearch
} from '~~/shared/types/research'
import type { PlayerSnapshot } from '~~/shared/types/game'
import {
  TECH_DEFS,
  ASCENSION_GATES,
  getTechById,
  getTechsByTier
} from '~~/shared/defs/research-tree'
import { ASCENSION_TIER_ORDER } from '~~/shared/types/research'

export const useResearchStore = defineStore('research', () => {
  const isOpen = ref(false)
  const searchQuery = ref('')
  const { t, te } = useI18n()

  const techNameKey = (id: string) => `game.research.techs.${id.replace('tech:', '')}.name`
  const techDescriptionKey = (id: string) => `game.research.techs.${id.replace('tech:', '')}.description`
  const getTechName = (tech: TechDef) => (te(techNameKey(tech.id)) ? t(techNameKey(tech.id)) : tech.name)
  const getTechDescription = (tech: TechDef) => {
    if (!tech.description) return ''
    return te(techDescriptionKey(tech.id)) ? t(techDescriptionKey(tech.id)) : tech.description
  }

  const ascensionTierReached = ref<AscensionTier>('k0.6')
  const computeLevel = ref(1)
  const empireState = ref({
    planetsControlled: 1,
    homeSystemMajority: true,
    intelLevel: 'low' as 'low' | 'medium' | 'high',
    starsControlled: 0,
    dysonStages: 0,
    galaxyStarFraction: 0
  })

  // Initialzustand: keine Forschung abgeschlossen und keine aktive Forschung
  const completedTechIds = ref<string[]>([])

  const activeResearch = ref<ActiveResearch | undefined>(undefined)
  const progressMemory = ref<Record<string, number>>({})
  const researchPointsPerTurn = ref(0)

  const allTechs = computed(() => TECH_DEFS)

  const techsByTier = computed(() => {
    const grouped = new Map<AscensionTier, TechDef[]>()
    for (const tier of ASCENSION_TIER_ORDER) {
      grouped.set(tier, getTechsByTier(tier))
    }
    return grouped
  })

  const filteredTechs = computed(() => {
    if (!searchQuery.value.trim()) {
      return allTechs.value
    }
    const query = searchQuery.value.toLowerCase()
    return allTechs.value.filter(tech =>
      getTechName(tech).toLowerCase().includes(query)
      || getTechDescription(tech).toLowerCase().includes(query)
      || t(`game.research.categories.${tech.category}`).toLowerCase().includes(query)
    )
  })

  const filteredTechsByTier = computed(() => {
    const grouped = new Map<AscensionTier, TechDef[]>()
    for (const tier of ASCENSION_TIER_ORDER) {
      const techs = filteredTechs.value.filter(t => t.tier === tier)
      if (techs.length > 0) {
        grouped.set(tier, techs)
      }
    }
    return grouped
  })

  function isTechCompleted(techId: string): boolean {
    return completedTechIds.value.includes(techId)
  }

  function isTechResearching(techId: string): boolean {
    return activeResearch.value?.techId === techId
  }

  function getTierIndex(tier: AscensionTier): number {
    return ASCENSION_TIER_ORDER.indexOf(tier)
  }

  function isTierUnlocked(tier: AscensionTier): boolean {
    const reachedIndex = getTierIndex(ascensionTierReached.value)
    const targetIndex = getTierIndex(tier)
    return targetIndex <= reachedIndex
  }

  function isTechAvailable(techId: string): boolean {
    if (isTechCompleted(techId) || isTechResearching(techId)) {
      return false
    }
    const reasons = getTechLockedReasons(techId)
    return reasons.length === 0
  }

  function getTechLockedReasons(techId: string): TechLockedReason[] {
    const tech = getTechById(techId)
    if (!tech) return [{ type: 'prerequisite', message: t('game.research.locked.tech-not-found') }]

    const reasons: TechLockedReason[] = []

    for (const prereqId of tech.prerequisites) {
      if (!isTechCompleted(prereqId)) {
        const prereq = getTechById(prereqId)
        const prereqName = prereq ? getTechName(prereq) : prereqId
        reasons.push({
          type: 'prerequisite',
          message: t('game.research.locked.requires-tech', { tech: prereqName }),
          value: prereqId
        })
      }
    }

    if (!isTierUnlocked(tech.tier)) {
      reasons.push({
        type: 'ascension',
        message: t('game.research.locked.requires-ascension', { tier: t(`game.research.tiers.${tech.tier.replace('.', '-')}`) }),
        value: tech.tier
      })
    }

    if (tech.requires?.compute && computeLevel.value < tech.requires.compute) {
      reasons.push({
        type: 'compute',
        message: t('game.research.locked.requires-compute', { level: tech.requires.compute }),
        value: computeLevel.value,
        required: tech.requires.compute
      })
    }

    if (tech.requires?.empire) {
      const req = tech.requires.empire
      if (req.planetsControlled && empireState.value.planetsControlled < req.planetsControlled) {
        reasons.push({
          type: 'empire',
          message: t('game.research.locked.requires-planets', { count: req.planetsControlled }),
          value: empireState.value.planetsControlled,
          required: req.planetsControlled
        })
      }
      if (req.homeSystemMajority && !empireState.value.homeSystemMajority) {
        reasons.push({
          type: 'empire',
          message: t('game.research.locked.requires-home-system')
        })
      }
      if (req.intelLevel) {
        const intelOrder = ['low', 'medium', 'high']
        const currentIndex = intelOrder.indexOf(empireState.value.intelLevel)
        const requiredIndex = intelOrder.indexOf(req.intelLevel)
        if (currentIndex < requiredIndex) {
          reasons.push({
            type: 'empire',
            message: t('game.research.locked.requires-intel', { level: t(`game.systems.intel.${req.intelLevel}`) }),
            value: empireState.value.intelLevel,
            required: req.intelLevel
          })
        }
      }
      if (req.starsControlled && empireState.value.starsControlled < req.starsControlled) {
        reasons.push({
          type: 'empire',
          message: t('game.research.locked.requires-stars', { count: req.starsControlled }),
          value: empireState.value.starsControlled,
          required: req.starsControlled
        })
      }
      if (req.dysonStages && empireState.value.dysonStages < req.dysonStages) {
        reasons.push({
          type: 'empire',
          message: t('game.research.locked.requires-dyson', { count: req.dysonStages }),
          value: empireState.value.dysonStages,
          required: req.dysonStages
        })
      }
      if (req.galaxyStarFraction && empireState.value.galaxyStarFraction < req.galaxyStarFraction) {
        reasons.push({
          type: 'empire',
          message: t('game.research.locked.requires-galaxy-stars', { percent: Math.round(req.galaxyStarFraction * 100) }),
          value: `${Math.round(empireState.value.galaxyStarFraction * 100)}%`,
          required: `${Math.round(req.galaxyStarFraction * 100)}%`
        })
      }
    }

    return reasons
  }

  function getTechStatus(techId: string): TechStatus {
    if (isTechCompleted(techId)) return 'completed'
    if (isTechResearching(techId)) return 'researching'
    if (isTechAvailable(techId)) return 'available'
    return 'locked'
  }

  function getTechPointsRequired(techId: string): number {
    const tech = getTechById(techId)
    if (!tech) return 0
    return tech.researchPoints ?? 0
  }

  function getProgressPercent(techId: string): number {
    const required = getTechPointsRequired(techId)
    if (required <= 0) return 0
    const current = activeResearch.value?.techId === techId
      ? activeResearch.value.progressPoints
      : (progressMemory.value[techId] ?? 0)
    return Math.min(100, Math.round((current / required) * 100))
  }

  function getRemainingTurns(techId: string): number {
    const required = getTechPointsRequired(techId)
    if (required <= 0) return 0
    const current = activeResearch.value?.techId === techId
      ? activeResearch.value.progressPoints
      : (progressMemory.value[techId] ?? 0)
    const remaining = Math.max(0, required - current)
    if (researchPointsPerTurn.value <= 0) return 0
    return Math.max(1, Math.ceil(remaining / researchPointsPerTurn.value))
  }

  function canAscend(toTier: AscensionTier): boolean {
    const gate = ASCENSION_GATES.find(g => g.toTier === toTier)
    if (!gate) return false

    const prevTierIndex = getTierIndex(toTier) - 1
    if (prevTierIndex < 0) return true
    const prevTier = ASCENSION_TIER_ORDER[prevTierIndex]!
    if (getTierIndex(ascensionTierReached.value) < getTierIndex(prevTier)) {
      return false
    }

    for (const techId of gate.requiresTech) {
      if (!isTechCompleted(techId)) return false
    }

    if (computeLevel.value < gate.requiresCompute) return false

    if (gate.requiresEmpire) {
      const req = gate.requiresEmpire
      if (req.planetsControlled && empireState.value.planetsControlled < req.planetsControlled) {
        return false
      }
      if (req.homeSystemMajority && !empireState.value.homeSystemMajority) {
        return false
      }
      if (req.intelLevel) {
        const intelOrder = ['low', 'medium', 'high']
        if (intelOrder.indexOf(empireState.value.intelLevel) < intelOrder.indexOf(req.intelLevel)) {
          return false
        }
      }
      if (req.starsControlled && empireState.value.starsControlled < req.starsControlled) {
        return false
      }
      if (req.dysonStages && empireState.value.dysonStages < req.dysonStages) {
        return false
      }
      if (req.galaxyStarFraction && empireState.value.galaxyStarFraction < req.galaxyStarFraction) {
        return false
      }
    }

    return true
  }

  function getAscensionGateStatus(toTier: AscensionTier) {
    const gate = ASCENSION_GATES.find(g => g.toTier === toTier)
    if (!gate) return null

    const techProgress = gate.requiresTech.map(techId => ({
      techId,
      tech: getTechById(techId),
      completed: isTechCompleted(techId)
    }))

    const computeMet = computeLevel.value >= gate.requiresCompute

    let empireMet = true
    const empireDetails: Array<{ requirement: string, met: boolean }> = []

    if (gate.requiresEmpire) {
      const req = gate.requiresEmpire
      if (req.planetsControlled) {
        const met = empireState.value.planetsControlled >= req.planetsControlled
        empireMet = empireMet && met
        empireDetails.push({
          requirement: t('game.research.gate.requirements.planets', { count: req.planetsControlled }),
          met
        })
      }
      if (req.homeSystemMajority) {
        const met = empireState.value.homeSystemMajority
        empireMet = empireMet && met
        empireDetails.push({
          requirement: t('game.research.gate.requirements.home-system'),
          met
        })
      }
      if (req.intelLevel) {
        const intelOrder = ['low', 'medium', 'high']
        const met = intelOrder.indexOf(empireState.value.intelLevel) >= intelOrder.indexOf(req.intelLevel)
        empireMet = empireMet && met
        empireDetails.push({
          requirement: t('game.research.gate.requirements.intel', { level: t(`game.systems.intel.${req.intelLevel}`) }),
          met
        })
      }
      if (req.starsControlled) {
        const met = empireState.value.starsControlled >= req.starsControlled
        empireMet = empireMet && met
        empireDetails.push({
          requirement: t('game.research.gate.requirements.stars', { count: req.starsControlled }),
          met
        })
      }
      if (req.dysonStages) {
        const met = empireState.value.dysonStages >= req.dysonStages
        empireMet = empireMet && met
        empireDetails.push({
          requirement: t('game.research.gate.requirements.dyson', { count: req.dysonStages }),
          met
        })
      }
      if (req.galaxyStarFraction) {
        const met = empireState.value.galaxyStarFraction >= req.galaxyStarFraction
        empireMet = empireMet && met
        empireDetails.push({
          requirement: t('game.research.gate.requirements.galaxy-stars', { percent: Math.round(req.galaxyStarFraction * 100) }),
          met
        })
      }
    }

    return {
      gate,
      techProgress,
      computeRequired: gate.requiresCompute,
      computeCurrent: computeLevel.value,
      computeMet,
      empireDetails,
      empireMet,
      canAscend: canAscend(toTier),
      alreadyAscended: getTierIndex(ascensionTierReached.value) >= getTierIndex(toTier)
    }
  }

  function startResearch(techId: string) {
    if (!isTechAvailable(techId) && activeResearch.value?.techId !== techId) return false

    if (activeResearch.value && activeResearch.value.techId !== techId) {
      progressMemory.value[activeResearch.value.techId] = activeResearch.value.progressPoints
    }

    if (!activeResearch.value || activeResearch.value.techId !== techId) {
      const stored = progressMemory.value[techId] ?? 0
      activeResearch.value = {
        techId,
        startedAt: Date.now(),
        progressPoints: stored
      }
    }
    return true
  }

  function cancelResearch() {
    if (activeResearch.value) {
      progressMemory.value[activeResearch.value.techId] = activeResearch.value.progressPoints
    }
    activeResearch.value = undefined
  }

  function completeResearch() {
    if (!activeResearch.value) return
    completedTechIds.value.push(activeResearch.value.techId)
    const { [activeResearch.value.techId]: _removed, ...remaining } = progressMemory.value
    progressMemory.value = remaining
    activeResearch.value = undefined
  }

  function tickProgress(deltaPoints: number = 10) {
    if (!activeResearch.value) return
    activeResearch.value.progressPoints = Math.max(0, activeResearch.value.progressPoints + deltaPoints)
  }

  function ascendToTier(tier: AscensionTier) {
    if (!canAscend(tier)) return false
    ascensionTierReached.value = tier
    return true
  }

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  function hydrateFromSnapshot(player: PlayerSnapshot) {
    ascensionTierReached.value = player.research.ascensionTierReached
    computeLevel.value = player.research.computeLevel
    empireState.value = { ...player.research.empireState }
    completedTechIds.value = [...player.research.completedTechIds]
    activeResearch.value = player.research.activeResearch
      ? { ...player.research.activeResearch }
      : undefined
    progressMemory.value = { ...player.research.progressMemory }
  }

  function setResearchPointsPerTurn(points: number) {
    researchPointsPerTurn.value = points
  }

  return {
    isOpen,
    searchQuery,
    ascensionTierReached,
    computeLevel,
    empireState,
    completedTechIds,
    activeResearch,
    progressMemory,
    researchPointsPerTurn,

    allTechs,
    techsByTier,
    filteredTechs,
    filteredTechsByTier,

    isTechCompleted,
    isTechResearching,
    isTechAvailable,
    getTechLockedReasons,
    getTechStatus,
    getTechPointsRequired,
    getProgressPercent,
    getRemainingTurns,
    isTierUnlocked,

    canAscend,
    getAscensionGateStatus,

    startResearch,
    cancelResearch,
    completeResearch,
    tickProgress,
    ascendToTier,

    open,
    close,
    toggle,
    setSearchQuery,
    hydrateFromSnapshot,
    setResearchPointsPerTurn
  }
})

<script setup lang="ts">
import type { TechDef, AscensionTier, AscensionGateDef } from '~~/shared/types/research'
import {
  ASCENSION_TIER_ORDER,
  RESEARCH_CATEGORY_COLORS,
  RESEARCH_CATEGORY_ICONS
} from '~~/shared/types/research'
import { TECH_DEFS, ASCENSION_GATES, getTechById } from '~~/shared/defs/research-tree'
import { getUnlocksForTech } from '~~/shared/defs/production'
import type { ResearchId } from '~~/shared/types/game'

const emit = defineEmits<{
  'close': []
  'start-research': [techId: string]
}>()

const store = useResearchStore()
const { t, te } = useI18n()

const getTierLabel = (tier: AscensionTier) => t(`game.research.tiers.${tier.replace('.', '-')}`)
const techNameKey = (id: string) => `game.research.techs.${id.replace('tech:', '')}.name`
const getTechName = (tech: TechDef) => (te(techNameKey(tech.id)) ? t(techNameKey(tech.id)) : tech.name)

// --- Layout Constants ---
const NODE_WIDTH = 200
const NODE_HEIGHT = 100
const COL_GAP = 50
const ROW_GAP = 80
const MAX_COLS = 5
const CORNER_RADIUS = 12
const GATE_HEIGHT_COLLAPSED = 56
const GATE_HEIGHT_EXPANDED = 140
const TIER_PADDING = 70
const PADDING = 80

// --- State ---
const selectedTechId = ref<string | null>(null)
const hoveredTechId = ref<string | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const expandedGates = ref<Set<AscensionTier>>(new Set())

// Toggle gate expansion
const toggleGate = (tier: AscensionTier) => {
  if (expandedGates.value.has(tier)) {
    expandedGates.value.delete(tier)
  } else {
    expandedGates.value.add(tier)
  }
  // Trigger reactivity
  expandedGates.value = new Set(expandedGates.value)
}

const isGateExpanded = (tier: AscensionTier) => expandedGates.value.has(tier)

// --- Group techs by tier ---
const techsByTier = computed(() => {
  const map = new Map<AscensionTier, TechDef[]>()
  for (const tier of ASCENSION_TIER_ORDER) {
    map.set(tier, [])
  }
  for (const tech of TECH_DEFS) {
    map.get(tech.tier)?.push(tech)
  }
  return map
})

// --- Calculate depth within tier (dependency-based rows) ---
interface TechDepthInfo {
  tech: TechDef
  depth: number // 0 = root within tier (no prereqs in same tier), higher = more deps
}

const getTechDepthsInTier = (tier: AscensionTier): TechDepthInfo[] => {
  const techs = techsByTier.value.get(tier) || []
  const techIds = new Set(techs.map(t => t.id))
  const depthMap = new Map<string, number>()

  // Calculate depth based on prereqs within the same tier
  const getDepth = (techId: string, visited: Set<string> = new Set()): number => {
    if (visited.has(techId)) return 0
    if (depthMap.has(techId)) return depthMap.get(techId)!

    visited.add(techId)
    const tech = techs.find(t => t.id === techId)
    if (!tech) return 0

    // Only consider prereqs within the same tier
    const prereqsInTier = tech.prerequisites.filter(p => techIds.has(p))
    if (prereqsInTier.length === 0) {
      depthMap.set(techId, 0)
      return 0
    }

    const maxPrereqDepth = Math.max(...prereqsInTier.map(p => getDepth(p, visited)))
    const depth = maxPrereqDepth + 1
    depthMap.set(techId, depth)
    return depth
  }

  techs.forEach(t => getDepth(t.id))

  return techs.map(t => ({
    tech: t,
    depth: depthMap.get(t.id) || 0
  }))
}

// --- Calculate tier Y positions (bottom to top: K0.6 at bottom, K3.0 at top) ---
interface TierLayout {
  tier: AscensionTier
  y: number
  height: number
  rowCount: number
  techsByRow: Map<number, TechDef[]>
}

const tierLayouts = computed((): TierLayout[] => {
  const layouts: TierLayout[] = []
  let currentY = TIER_PADDING

  // Process tiers from top (K3.0) to bottom (K0.6) for visual layout
  const reversedTiers = [...ASCENSION_TIER_ORDER].reverse()

  for (const tier of reversedTiers) {
    const techDepths = getTechDepthsInTier(tier)
    const maxDepth = Math.max(0, ...techDepths.map(t => t.depth))
    const rowCount = maxDepth + 1

    // Group techs by their depth (row)
    const techsByRow = new Map<number, TechDef[]>()
    for (let i = 0; i <= maxDepth; i++) {
      techsByRow.set(i, [])
    }
    techDepths.forEach(({ tech, depth }) => {
      techsByRow.get(depth)?.push(tech)
    })

    const tierHeight = rowCount * NODE_HEIGHT + (rowCount - 1) * ROW_GAP

    layouts.push({
      tier,
      y: currentY,
      height: tierHeight,
      rowCount,
      techsByRow
    })

    currentY += tierHeight + TIER_PADDING

    // Add space for gate (except after K0.6 which is the bottom)
    if (tier !== 'k0.6') {
      // Use expanded height if gate is expanded
      const gateHeight = isGateExpanded(tier) ? GATE_HEIGHT_EXPANDED : GATE_HEIGHT_COLLAPSED
      currentY += gateHeight + TIER_PADDING
    }
  }

  return layouts
})

// --- Node positions based on tier grouping with dependency-based rows ---
interface NodePosition {
  tech: TechDef
  x: number
  y: number
  row: number
  col: number
}

const nodePositions = computed((): Map<string, NodePosition> => {
  const positions = new Map<string, NodePosition>()
  const totalWidth = MAX_COLS * NODE_WIDTH + (MAX_COLS - 1) * COL_GAP

  for (const layout of tierLayouts.value) {
    // Row 0 = top of tier (most dependent), max row = bottom (roots within tier)
    // But visually we want roots at bottom of tier, so we reverse
    const maxRow = layout.rowCount - 1

    for (let depth = 0; depth <= maxRow; depth++) {
      const techsInRow = layout.techsByRow.get(depth) || []
      // Visual row: depth 0 (no deps in tier) at bottom of tier section
      const visualRow = maxRow - depth

      // Sort techs in row by their dependencies for consistent positioning
      techsInRow.sort((a, b) => {
        // Sort by number of children (techs that depend on this) to center parents
        const aChildren = TECH_DEFS.filter(t => t.prerequisites.includes(a.id)).length
        const bChildren = TECH_DEFS.filter(t => t.prerequisites.includes(b.id)).length
        if (aChildren !== bChildren) return bChildren - aChildren
        return a.id.localeCompare(b.id)
      })

      // Center techs within their row
      const rowWidth = techsInRow.length * NODE_WIDTH + (techsInRow.length - 1) * COL_GAP
      const startX = PADDING + (totalWidth - rowWidth) / 2

      techsInRow.forEach((tech, colIdx) => {
        positions.set(tech.id, {
          tech,
          x: startX + colIdx * (NODE_WIDTH + COL_GAP),
          y: layout.y + visualRow * (NODE_HEIGHT + ROW_GAP),
          row: visualRow,
          col: colIdx
        })
      })
    }
  }

  return positions
})

// --- Gate positions (between tiers) ---
interface GatePosition {
  gate: AscensionGateDef
  fromTier: AscensionTier
  y: number
  width: number
  x: number
  height: number
}

const gatePositions = computed((): GatePosition[] => {
  const gates: GatePosition[] = []
  const totalWidth = MAX_COLS * NODE_WIDTH + (MAX_COLS - 1) * COL_GAP

  for (let i = 0; i < tierLayouts.value.length - 1; i++) {
    const upperTierLayout = tierLayouts.value[i]
    const lowerTierLayout = tierLayouts.value[i + 1]

    if (!upperTierLayout || !lowerTierLayout) continue

    const gate = ASCENSION_GATES.find(g => g.toTier === upperTierLayout.tier)
    if (!gate) continue

    // Gate Y is between the two tier sections
    const gateY = upperTierLayout.y + upperTierLayout.height + TIER_PADDING / 2
    const gateHeight = isGateExpanded(upperTierLayout.tier) ? GATE_HEIGHT_EXPANDED : GATE_HEIGHT_COLLAPSED

    gates.push({
      gate,
      fromTier: lowerTierLayout.tier,
      y: gateY,
      width: totalWidth + 40, // Extra width to cover lines
      x: PADDING - 20,
      height: gateHeight
    })
  }

  return gates
})

// --- Connections ---
interface Connection {
  from: NodePosition
  to: NodePosition
  highlighted: boolean
  completed: boolean
}

const connections = computed((): Connection[] => {
  const conns: Connection[] = []

  TECH_DEFS.forEach((tech) => {
    const toPos = nodePositions.value.get(tech.id)
    if (!toPos) return

    tech.prerequisites.forEach((prereqId) => {
      const fromPos = nodePositions.value.get(prereqId)
      if (!fromPos) return

      const isHighlighted
        = hoveredTechId.value === tech.id
          || hoveredTechId.value === prereqId
          || selectedTechId.value === tech.id
          || selectedTechId.value === prereqId

      const isCompleted
        = store.isTechCompleted(prereqId)
          && store.isTechCompleted(tech.id)

      conns.push({
        from: fromPos,
        to: toPos,
        highlighted: isHighlighted,
        completed: isCompleted
      })
    })
  })

  return conns
})

// --- ViewBox Dimensions ---
const viewBoxDimensions = computed(() => {
  const positions = Array.from(nodePositions.value.values())
  if (positions.length === 0) {
    return { minX: 0, minY: 0, width: 1200, height: 800 }
  }

  const xs = positions.map(p => p.x)
  const ys = positions.map(p => p.y)
  const minX = Math.min(...xs) - 60
  const maxX = Math.max(...xs) + NODE_WIDTH + 60
  const minY = Math.min(...ys) - 60
  // Add extra height for gates
  const maxY = Math.max(...ys) + NODE_HEIGHT + 60

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, MAX_COLS * (NODE_WIDTH + COL_GAP) + 120),
    height: maxY - minY
  }
})

// --- Gate Status Helpers ---
interface GateStatus {
  isUnlocked: boolean
  techsCompleted: number
  techsRequired: number
  computeMet: boolean
  empireMet: boolean
  requiredTechNames: { name: string, completed: boolean }[]
}

const getGateStatus = (gate: AscensionGateDef): GateStatus => {
  const requiredTechNames = gate.requiresTech.map((techId) => {
    const tech = getTechById(techId)
    return {
      name: tech ? getTechName(tech) : techId,
      completed: store.isTechCompleted(techId)
    }
  })

  const techsCompleted = requiredTechNames.filter(t => t.completed).length
  const computeMet = store.computeLevel >= gate.requiresCompute
  let empireMet = true

  if (gate.requiresEmpire) {
    if (gate.requiresEmpire.planetsControlled && store.empireState.planetsControlled < gate.requiresEmpire.planetsControlled) {
      empireMet = false
    }
    if (gate.requiresEmpire.homeSystemMajority && !store.empireState.homeSystemMajority) {
      empireMet = false
    }
  }

  const isUnlocked = techsCompleted === gate.requiresTech.length && computeMet && empireMet

  return {
    isUnlocked,
    techsCompleted,
    techsRequired: gate.requiresTech.length,
    computeMet,
    empireMet,
    requiredTechNames
  }
}

// --- Path Generation for Straight Lines with Rounded Corners ---
// All connections use CENTER of nodes for cleaner appearance
const getPathD = (conn: Connection): string => {
  const fromX = conn.from.x + NODE_WIDTH / 2
  const fromY = conn.from.y + NODE_HEIGHT / 2 // CENTER of parent
  const toX = conn.to.x + NODE_WIDTH / 2
  const toY = conn.to.y + NODE_HEIGHT / 2 // CENTER of child

  // If nodes are vertically aligned, just draw a straight line
  if (Math.abs(fromX - toX) < 2) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`
  }

  // Calculate midpoint Y for the horizontal segment
  const midY = (fromY + toY) / 2
  const r = Math.min(CORNER_RADIUS, Math.abs(midY - fromY) / 2, Math.abs(toY - midY) / 2)

  // Determine direction
  const goingRight = toX > fromX
  const dx = goingRight ? r : -r

  return [
    `M ${fromX} ${fromY}`,
    `L ${fromX} ${midY + r}`,
    `Q ${fromX} ${midY}, ${fromX + dx} ${midY}`,
    `L ${toX - dx} ${midY}`,
    `Q ${toX} ${midY}, ${toX} ${midY - r}`,
    `L ${toX} ${toY}`
  ].join(' ')
}

// --- Helpers ---
const getCategoryColor = (category: string): string => {
  return RESEARCH_CATEGORY_COLORS[category as keyof typeof RESEARCH_CATEGORY_COLORS] || 'neutral'
}

const getCategoryIcon = (category: string): string => {
  return RESEARCH_CATEGORY_ICONS[category as keyof typeof RESEARCH_CATEGORY_ICONS] || 'i-lucide-circle'
}

const getTierColor = (tier: AscensionTier): string => {
  const tierIndex = ASCENSION_TIER_ORDER.indexOf(tier)
  const colors = ['success', 'info', 'blue', 'primary', 'purple', 'pink', 'critical']
  return colors[tierIndex] || 'neutral'
}

// --- Unlocks (buildings/units gated behind a tech) ---
const buildingUnlockName = (id: string) => {
  const key = `game.buildings.${id.replace('bld:', '')}.name`
  return te(key) ? t(key) : id
}
const unitUnlockName = (id: string) => {
  const key = `game.units.${id.replace('unit:', '')}.name`
  return te(key) ? t(key) : id
}

const getTechUnlocks = (techId: string): Array<{ id: string, icon: string, name: string }> => {
  const unlocks = getUnlocksForTech(techId as ResearchId)
  return [
    ...unlocks.buildings.map(def => ({ id: def.id, icon: def.icon ?? 'i-lucide-hammer', name: buildingUnlockName(def.id) })),
    ...unlocks.units.map(def => ({ id: def.id, icon: def.icon ?? 'i-lucide-rocket', name: unitUnlockName(def.id) }))
  ]
}

// --- Event Handlers ---
const handleTechHover = (techId: string | null) => {
  hoveredTechId.value = techId
}

const handleTechClick = (techId: string) => {
  const status = store.getTechStatus(techId)
  if (status !== 'available' && status !== 'researching') return
  selectedTechId.value = selectedTechId.value === techId ? null : techId
  emit('start-research', techId)
}

// --- Navigation ---
const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
  if (!scrollContainer.value) return
  scrollContainer.value.scrollTo({
    top: scrollContainer.value.scrollHeight,
    behavior
  })
}

onMounted(() => {
  nextTick(() => {
    // Start at bottom where root (Bootstrapped AI Core) is
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    } else {
      scrollToBottom('auto')
    }
  })
})
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center p-4 overflow-hidden">
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-neutral-950/95 backdrop-blur-md"
      @click="emit('close')"
    />

    <!-- Panel -->
    <div class="relative w-full max-w-[98vw] max-h-full flex flex-col rounded-2xl border border-info-500/40 bg-neutral-900/98 shadow-2xl shadow-info-500/20 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-neutral-700/60 bg-neutral-900/90 shrink-0">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-linear-to-br from-info-500/30 to-blue-600/20 flex items-center justify-center ring-1 ring-info-500/30">
            <UIcon
              name="i-lucide-flask-conical"
              class="w-6 h-6 text-info-400"
            />
          </div>
          <div>
            <h2 class="text-xl font-bold text-neutral-100">
              {{ $t('game.research.tree.title') }}
            </h2>
            <div class="flex items-center gap-3 mt-1 text-sm text-neutral-400">
              <UBadge
                :color="(getTierColor(store.ascensionTierReached) as any)"
                variant="subtle"
                size="sm"
              >
                {{ getTierLabel(store.ascensionTierReached) }}
              </UBadge>
              <span class="text-neutral-600">•</span>
              <span>{{ $t('game.research.tree.completed-count', { completed: store.completedTechIds.length, total: TECH_DEFS.length }) }}</span>
            </div>
          </div>
        </div>

        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="research-close"
          @click="emit('close')"
        />
      </div>

      <!-- Tree View Container -->
      <div
        ref="scrollContainer"
        class="flex-1 overflow-auto"
        style="background: linear-gradient(to bottom, rgb(2 6 23 / 0.9), rgb(15 23 42 / 0.7), rgb(2 6 23 / 0.9));"
      >
        <div
          class="relative"
          :style="{
            width: `${viewBoxDimensions.width}px`,
            height: `${viewBoxDimensions.height}px`,
            minWidth: '100%'
          }"
        >
          <!-- SVG Layer for Connections -->
          <svg
            class="absolute inset-0 pointer-events-none"
            :viewBox="`${viewBoxDimensions.minX} ${viewBoxDimensions.minY} ${viewBoxDimensions.width} ${viewBoxDimensions.height}`"
            :width="viewBoxDimensions.width"
            :height="viewBoxDimensions.height"
            style="overflow: visible;"
          >
            <!-- Glow Filter -->
            <defs>
              <filter
                id="connectionGlow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur
                  stdDeviation="4"
                  result="coloredBlur"
                />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient
                id="lineGradientHighlight"
                x1="0%"
                y1="100%"
                x2="0%"
                y2="0%"
              >
                <stop
                  offset="0%"
                  stop-color="#22d3ee"
                />
                <stop
                  offset="100%"
                  stop-color="#3b82f6"
                />
              </linearGradient>
              <linearGradient
                id="lineGradientCompleted"
                x1="0%"
                y1="100%"
                x2="0%"
                y2="0%"
              >
                <stop
                  offset="0%"
                  stop-color="#10b981"
                />
                <stop
                  offset="100%"
                  stop-color="#34d399"
                />
              </linearGradient>
            </defs>

            <!-- All connections -->
            <path
              v-for="conn in connections"
              :key="`conn-${conn.from.tech.id}-${conn.to.tech.id}`"
              :d="getPathD(conn)"
              fill="none"
              :stroke="conn.highlighted ? 'url(#lineGradientHighlight)' : (conn.completed ? '#10b981' : '#475569')"
              :stroke-width="conn.highlighted ? 4 : (conn.completed ? 3 : 2)"
              :stroke-opacity="conn.highlighted ? 1 : (conn.completed ? 0.7 : 0.5)"
              stroke-linecap="round"
              :filter="conn.highlighted ? 'url(#connectionGlow)' : undefined"
            />
          </svg>

          <!-- Ascension Gates (ABOVE SVG to cover lines) -->
          <div
            v-for="gatePos in gatePositions"
            :key="`gate-${gatePos.gate.toTier}`"
            :data-testid="`ascension-gate-${gatePos.gate.toTier}`"
            class="absolute z-20 cursor-pointer transition-all duration-500 ease-in-out"
            :style="{
              left: `${gatePos.x - viewBoxDimensions.minX}px`,
              top: `${gatePos.y - viewBoxDimensions.minY}px`,
              width: `${gatePos.width}px`
            }"
            @click="toggleGate(gatePos.gate.toTier)"
          >
            <!-- Solid background to cover lines with smooth height animation -->
            <div
              class="rounded-xl border-2 overflow-hidden shadow-xl transition-all duration-500 ease-in-out"
              :class="[
                getGateStatus(gatePos.gate).isUnlocked
                  ? 'border-success-500/70'
                  : 'border-warning-500/50'
              ]"
              :style="{ backgroundColor: '#0f172a' }"
            >
              <!-- Collapsed View (always visible) -->
              <div
                class="px-4 py-2.5 flex items-center justify-between"
                :class="[
                  getGateStatus(gatePos.gate).isUnlocked
                    ? 'bg-linear-to-r from-success-950 via-success-900/80 to-success-950'
                    : 'bg-linear-to-r from-warning-950 via-warning-900/60 to-warning-950'
                ]"
              >
                <!-- Gate Left: Icon + Tier Name -->
                <div class="flex items-center gap-3">
                  <div
                    class="w-9 h-9 rounded-lg flex items-center justify-center"
                    :class="[
                      getGateStatus(gatePos.gate).isUnlocked
                        ? 'bg-success-500/40 ring-1 ring-success-400/60'
                        : 'bg-warning-500/30 ring-1 ring-warning-400/50'
                    ]"
                  >
                    <UIcon
                      :name="getGateStatus(gatePos.gate).isUnlocked ? 'i-lucide-unlock' : 'i-lucide-lock'"
                      class="w-5 h-5"
                      :class="getGateStatus(gatePos.gate).isUnlocked ? 'text-success-300' : 'text-warning-300'"
                    />
                  </div>
                  <div>
                    <div
                      class="text-sm font-bold"
                      :class="getGateStatus(gatePos.gate).isUnlocked ? 'text-success-200' : 'text-warning-200'"
                    >
                      {{ $t('game.research.gate.status-ascend-to') }} {{ getTierLabel(gatePos.gate.toTier) }}
                    </div>
                    <div
                      class="text-xs"
                      :class="getGateStatus(gatePos.gate).isUnlocked ? 'text-success-400/80' : 'text-warning-400/80'"
                    >
                      {{ getGateStatus(gatePos.gate).isUnlocked ? $t('game.research.gate.unlocked') : $t('game.research.gate.click-details') }}
                    </div>
                  </div>
                </div>

                <!-- Gate Right: Summary + Expand Icon -->
                <div class="flex items-center gap-4">
                  <!-- Quick Status -->
                  <div class="flex items-center gap-3">
                    <div
                      class="flex items-center gap-1.5 px-2 py-1 rounded-md"
                      :class="getGateStatus(gatePos.gate).techsCompleted === getGateStatus(gatePos.gate).techsRequired ? 'bg-success-500/20' : 'bg-neutral-800/50'"
                    >
                      <UIcon
                        name="i-lucide-flask-conical"
                        class="w-3.5 h-3.5"
                        :class="getGateStatus(gatePos.gate).techsCompleted === getGateStatus(gatePos.gate).techsRequired ? 'text-success-400' : 'text-neutral-400'"
                      />
                      <span
                        class="text-xs font-medium"
                        :class="getGateStatus(gatePos.gate).techsCompleted === getGateStatus(gatePos.gate).techsRequired ? 'text-success-300' : 'text-neutral-300'"
                      >
                        {{ getGateStatus(gatePos.gate).techsCompleted }}/{{ getGateStatus(gatePos.gate).techsRequired }}
                      </span>
                    </div>
                    <div
                      class="flex items-center gap-1.5 px-2 py-1 rounded-md"
                      :class="getGateStatus(gatePos.gate).computeMet ? 'bg-success-500/20' : 'bg-neutral-800/50'"
                    >
                      <UIcon
                        name="i-lucide-cpu"
                        class="w-3.5 h-3.5"
                        :class="getGateStatus(gatePos.gate).computeMet ? 'text-success-400' : 'text-neutral-400'"
                      />
                      <span
                        class="text-xs font-medium"
                        :class="getGateStatus(gatePos.gate).computeMet ? 'text-success-300' : 'text-neutral-300'"
                      >
                        {{ gatePos.gate.requiresCompute }}
                      </span>
                    </div>
                  </div>
                  <!-- Expand Icon with rotation animation -->
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="w-5 h-5 transition-transform duration-500 ease-in-out"
                    :class="[
                      getGateStatus(gatePos.gate).isUnlocked ? 'text-success-400' : 'text-warning-400',
                      isGateExpanded(gatePos.gate.toTier) ? 'rotate-180' : 'rotate-0'
                    ]"
                  />
                </div>
              </div>

              <!-- Expanded Details with slide animation -->
              <Transition
                enter-active-class="transition-all duration-500 ease-in-out"
                leave-active-class="transition-all duration-300 ease-in-out"
                enter-from-class="max-h-0 opacity-0"
                enter-to-class="max-h-40 opacity-100"
                leave-from-class="max-h-40 opacity-100"
                leave-to-class="max-h-0 opacity-0"
              >
                <div
                  v-if="isGateExpanded(gatePos.gate.toTier)"
                  class="px-4 py-3 border-t space-y-3 overflow-hidden"
                  :class="[
                    getGateStatus(gatePos.gate).isUnlocked
                      ? 'border-success-800/50 bg-neutral-900/95'
                      : 'border-warning-800/50 bg-neutral-900/95'
                  ]"
                >
                  <!-- Required Techs -->
                  <div>
                    <div class="text-xs font-semibold text-neutral-400 mb-2">
                      {{ $t('game.research.gate.required-techs') }}
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <div
                        v-for="(req, idx) in getGateStatus(gatePos.gate).requiredTechNames"
                        :key="idx"
                        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                        :class="req.completed ? 'bg-success-500/20 text-success-300' : 'bg-neutral-800 text-neutral-400'"
                      >
                        <UIcon
                          :name="req.completed ? 'i-lucide-check-circle' : 'i-lucide-circle'"
                          class="w-3.5 h-3.5"
                          :class="req.completed ? 'text-success-400' : 'text-neutral-500'"
                        />
                        {{ req.name }}
                      </div>
                    </div>
                  </div>

                  <!-- Other Requirements -->
                  <div class="flex items-center gap-4 pt-2 border-t border-neutral-800">
                    <!-- Compute -->
                    <div class="flex items-center gap-2">
                      <UIcon
                        name="i-lucide-cpu"
                        class="w-4 h-4"
                        :class="getGateStatus(gatePos.gate).computeMet ? 'text-success-400' : 'text-neutral-500'"
                      />
                      <span
                        class="text-xs"
                        :class="getGateStatus(gatePos.gate).computeMet ? 'text-success-300' : 'text-neutral-400'"
                      >
                        {{ $t('game.research.compute-label') }} {{ store.computeLevel }}/{{ gatePos.gate.requiresCompute }}
                      </span>
                    </div>

                    <!-- Empire Requirements -->
                    <div
                      v-if="gatePos.gate.requiresEmpire"
                      class="flex items-center gap-4"
                    >
                      <div
                        v-if="gatePos.gate.requiresEmpire.planetsControlled"
                        class="flex items-center gap-2"
                      >
                        <UIcon
                          name="i-lucide-globe"
                          class="w-4 h-4"
                          :class="store.empireState.planetsControlled >= gatePos.gate.requiresEmpire.planetsControlled ? 'text-success-400' : 'text-neutral-500'"
                        />
                        <span
                          class="text-xs"
                          :class="store.empireState.planetsControlled >= gatePos.gate.requiresEmpire.planetsControlled ? 'text-success-300' : 'text-neutral-400'"
                        >
                          {{ $t('game.research.gate.planets-label') }} {{ store.empireState.planetsControlled }}/{{ gatePos.gate.requiresEmpire.planetsControlled }}
                        </span>
                      </div>
                      <div
                        v-if="gatePos.gate.requiresEmpire.homeSystemMajority"
                        class="flex items-center gap-2"
                      >
                        <UIcon
                          name="i-lucide-crown"
                          class="w-4 h-4"
                          :class="store.empireState.homeSystemMajority ? 'text-success-400' : 'text-neutral-500'"
                        />
                        <span
                          class="text-xs"
                          :class="store.empireState.homeSystemMajority ? 'text-success-300' : 'text-neutral-400'"
                        >
                          {{ $t('game.research.gate.home-system-label') }} {{ store.empireState.homeSystemMajority ? '✓' : '✗' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- Tech Node Cards -->
          <div
            v-for="pos in nodePositions.values()"
            :key="pos.tech.id"
            :data-testid="`tech-node-${pos.tech.id}`"
            :data-status="store.getTechStatus(pos.tech.id)"
            class="absolute cursor-pointer transition-all duration-300 ease-out"
            :style="{
              left: `${pos.x - viewBoxDimensions.minX}px`,
              top: `${pos.y - viewBoxDimensions.minY}px`,
              width: `${NODE_WIDTH}px`,
              height: `${NODE_HEIGHT}px`
            }"
            @mouseenter="handleTechHover(pos.tech.id)"
            @mouseleave="handleTechHover(null)"
            @click="handleTechClick(pos.tech.id)"
          >
            <div
              class="h-full rounded-xl border-2 p-3 transition-all duration-300 relative overflow-hidden"
              :class="[
                // Status-based styling - solid backgrounds to hide lines
                store.getTechStatus(pos.tech.id) === 'completed'
                  ? 'border-success-500/70 bg-success-950 shadow-lg shadow-success-500/20'
                  : store.getTechStatus(pos.tech.id) === 'researching'
                    ? 'border-info-400 bg-info-950 shadow-xl shadow-info-500/40 ring-2 ring-info-400/40'
                    : store.getTechStatus(pos.tech.id) === 'available'
                      ? 'border-neutral-500/70 bg-neutral-800 hover:border-info-500/60 hover:shadow-lg hover:shadow-info-500/20'
                      : 'border-neutral-700/50 bg-neutral-900',
                // Hover/Selected state
                (hoveredTechId === pos.tech.id || selectedTechId === pos.tech.id)
                  ? 'scale-110 z-30 shadow-2xl ring-2 ring-info-400/60'
                  : 'z-10'
              ]"
            >
              <!-- Shimmer effect for researching -->
              <div
                v-if="store.getTechStatus(pos.tech.id) === 'researching'"
                class="absolute inset-0 bg-linear-to-r from-transparent via-info-400/10 to-transparent animate-shimmer"
              />

              <!-- Node Content -->
              <div class="relative z-10 flex flex-col h-full">
                <!-- Header: Icon + Title -->
                <div class="flex items-start gap-2">
                  <div
                    class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1"
                    :class="[
                      `bg-${getCategoryColor(pos.tech.category)}-500/25`,
                      `ring-${getCategoryColor(pos.tech.category)}-500/30`
                    ]"
                  >
                    <UIcon
                      :name="getCategoryIcon(pos.tech.category)"
                      class="w-4 h-4"
                      :class="`text-${getCategoryColor(pos.tech.category)}-400`"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="text-xs font-bold text-neutral-100 leading-tight line-clamp-2">
                      {{ getTechName(pos.tech) }}
                    </h4>
                    <span class="text-[10px] text-neutral-500 flex items-center gap-2 mt-0.5">
                      <span class="flex items-center gap-1">
                        <UIcon
                          name="i-lucide-clock"
                          class="w-2.5 h-2.5"
                        />
                        {{ $t('game.common.duration-rounds', { count: store.getRemainingTurns(pos.tech.id) }) }}
                      </span>
                      <span class="flex items-center gap-1">
                        <UIcon
                          name="i-lucide-flask-conical"
                          class="w-2.5 h-2.5"
                        />
                        {{ store.getTechPointsRequired(pos.tech.id) }}
                      </span>
                    </span>
                  </div>
                </div>

                <!-- Spacer -->
                <div class="flex-1" />

                <!-- Unlocked buildings/units -->
                <div
                  v-if="getTechUnlocks(pos.tech.id).length > 0"
                  class="mt-1 flex items-center gap-1"
                >
                  <span class="text-[9px] uppercase tracking-wide text-success-400/80 shrink-0">
                    {{ $t('game.research.unlocks-label') }}
                  </span>
                  <span
                    v-for="unlock in getTechUnlocks(pos.tech.id)"
                    :key="unlock.id"
                    :title="unlock.name"
                    class="flex items-center"
                  >
                    <UIcon
                      :name="unlock.icon"
                      class="w-3 h-3 text-neutral-300"
                    />
                  </span>
                </div>

                <!-- Progress bar -->
                <div
                  v-if="store.getProgressPercent(pos.tech.id) > 0"
                  class="mt-1"
                >
                  <UProgress
                    :model-value="store.getProgressPercent(pos.tech.id)"
                    color="info"
                    size="xs"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Legend Footer -->
      <div class="flex items-center justify-between px-6 py-3 border-t border-neutral-700/60 bg-neutral-900/90 shrink-0">
        <div class="flex items-center gap-6 text-sm">
          <span class="text-neutral-500 font-semibold">{{ $t('game.research.legend.title') }}</span>
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded-full bg-linear-to-br from-success-400 to-success-600 flex items-center justify-center">
              <UIcon
                name="i-lucide-check"
                class="w-3 h-3 text-neutral-950"
              />
            </div>
            <span class="text-neutral-400">{{ $t('game.research.legend.completed') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded-full bg-linear-to-br from-info-400 to-info-600 animate-pulse" />
            <span class="text-neutral-400">{{ $t('game.research.legend.researching') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded-lg border-2 border-neutral-500 bg-neutral-800" />
            <span class="text-neutral-400">{{ $t('game.research.legend.available') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded-lg border border-neutral-700 bg-neutral-900 opacity-50" />
            <span class="text-neutral-400">{{ $t('game.research.legend.locked') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}
</style>

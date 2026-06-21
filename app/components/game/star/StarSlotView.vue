<script setup lang="ts">
import type { BuildingId } from '~~/shared/types/game'
import { STAR_SLOT_COUNT } from '~~/shared/types/planetSlots'

interface BuildCosts {
  energy: number
  minerals: number
  rare: number
}

interface BuildingDefinition {
  id: string
  name: string
  description: string
  category: string
  maxLevel: number
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
  site?: 'planet' | 'star'
  resourceProduction?: Partial<Record<'energy' | 'minerals' | 'rare', number>>
  researchPoints?: number
  strategicCosts?: Partial<Record<string, number>>
  locked?: boolean
  lockedByTechName?: string | null
}

interface UnitDefinition {
  id: string
  name: string
  role: string
  category: 'support' | 'combat'
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
  requiresFacility: boolean
  strategicCosts?: Partial<Record<string, number>>
  locked?: boolean
  lockedByTechName?: string | null
}

interface QueueEntry {
  id: string
  kind: 'building' | 'unit'
  productionSpent: number
  resourcePaid: boolean
  slotIndex?: number
}

interface StarData {
  id: string
  name: string
  owner: string
  ownerLabel: string
  productionPerRound: number
  slots: Array<{ buildingId: string | null, buildingLevel: number, isConstructing: boolean, constructionTimeLeft: number, zone: string, resourceNode: string | null }>
  buildQueue: QueueEntry[]
  stationedUnits: Array<{ unitDefId: string, count: number }>
}

interface PlayerResources {
  energy: number
  minerals: number
  rare: number
  strategic?: Record<string, number>
}

const props = defineProps<{
  star: StarData
  /** Megastructure catalog (site: 'star' buildings only). */
  buildingCatalog: BuildingDefinition[]
  /** Units the Stellar Shipyard can produce (facility units). */
  unitCatalog: UnitDefinition[]
  /** Whether the viewer controls this star (false → read-only capture hint). */
  canBuild: boolean
  buildQueueLimit: number
  playerResources?: PlayerResources
}>()

const emit = defineEmits<{
  'close': []
  'queue-build': [planetId: string, buildId: string, kind: 'building' | 'unit', slotIndex?: number]
  'remove-queue-item': [planetId: string, index: number]
  'reorder-queue': [planetId: string, from: number, to: number]
}>()

const { t } = useI18n()

const DYSON_ID = 'bld:dyson-sphere'
const SHIPYARD_ID = 'bld:orbital-shipyard-mega'

// ── Layout ────────────────────────────────────────────────────────────
const STAR_RADIUS = 90
const SHELL_BASE_RADIUS = 150
const SHELL_STEP = 48
const SHELL_SLOT_SIZE = 48
const DYSON_RING_RADIUS = 118
const SHELL_ANGLES = [-90, 0, 90, 180]
const CANVAS_SIZE = (SHELL_BASE_RADIUS + (STAR_SLOT_COUNT - 1) * SHELL_STEP + SHELL_SLOT_SIZE + 36) * 2

// ── Catalog + placement state ─────────────────────────────────────────
const catalogTab = ref<'buildings' | 'units'>('buildings')
const placementBuildingId = ref<string | null>(null)
const hoveredSlotIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)

const cancelPlacement = () => {
  placementBuildingId.value = null
}

watch(() => props.star.id, () => {
  placementBuildingId.value = null
  hoveredSlotIndex.value = null
  catalogTab.value = 'buildings'
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && placementBuildingId.value) {
    e.stopPropagation()
    cancelPlacement()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))

// ── Shells: server state → render state (+ pending overlay) ───────────
const queuedBuildingBySlot = computed(() => {
  const map = new Map<number, { buildingId: string, queueIndex: number }>()
  props.star.buildQueue.forEach((entry, queueIndex) => {
    if (entry.kind === 'building' && entry.slotIndex !== undefined) {
      const slot = props.star.slots[entry.slotIndex]
      if (slot && !slot.isConstructing) map.set(entry.slotIndex, { buildingId: entry.id, queueIndex })
    }
  })
  return map
})

type ShellSlot = {
  index: number
  radius: number
  px: number
  py: number
  state: 'empty' | 'under-construction' | 'completed'
  buildingId: BuildingId | null
  progress: number
  queueIndex?: number
}

const shells = computed<ShellSlot[]>(() =>
  Array.from({ length: STAR_SLOT_COUNT }, (_, index) => {
    const radius = SHELL_BASE_RADIUS + index * SHELL_STEP
    const angle = (SHELL_ANGLES[index] ?? (index * 60 - 90)) * (Math.PI / 180)
    const base = { index, radius, px: Math.cos(angle) * radius, py: Math.sin(angle) * radius }
    const serverSlot = props.star.slots[index]

    if (serverSlot?.buildingId && !serverSlot.isConstructing) {
      return { ...base, state: 'completed', buildingId: serverSlot.buildingId as BuildingId, progress: 100 }
    }
    if (serverSlot?.buildingId && serverSlot.isConstructing) {
      const def = props.buildingCatalog.find(b => b.id === serverSlot.buildingId)
      const cost = def?.productionCost ?? 1
      const spent = Math.max(0, cost - serverSlot.constructionTimeLeft)
      return { ...base, state: 'under-construction', buildingId: serverSlot.buildingId as BuildingId, progress: Math.min(100, Math.round((spent / cost) * 100)) }
    }
    const queued = queuedBuildingBySlot.value.get(index)
    if (queued) {
      return { ...base, state: 'under-construction', buildingId: queued.buildingId as BuildingId, progress: 0, queueIndex: queued.queueIndex }
    }
    return { ...base, state: 'empty', buildingId: null, progress: 0 }
  }))

// ── Dyson hull visual ─────────────────────────────────────────────────
const dysonMax = computed(() => props.buildingCatalog.find(b => b.id === DYSON_ID)?.maxLevel ?? 5)
const dysonLevel = computed(() => {
  let level = 0
  for (const slot of props.star.slots) {
    if (slot.buildingId === DYSON_ID && !slot.isConstructing) level = Math.max(level, slot.buildingLevel)
  }
  return level
})
const dysonConstructing = computed(() =>
  props.star.slots.some(s => s.buildingId === DYSON_ID && s.isConstructing)
  || props.star.buildQueue.some(e => e.kind === 'building' && e.id === DYSON_ID))
const dysonPercent = computed(() => Math.round((dysonLevel.value / dysonMax.value) * 100))

// ── Affordability ─────────────────────────────────────────────────────
const canAfford = (costs: BuildCosts): boolean => {
  if (!props.playerResources) return true
  return props.playerResources.energy >= costs.energy
    && props.playerResources.minerals >= costs.minerals
    && props.playerResources.rare >= costs.rare
}

const STRATEGIC_ICONS: Record<string, string> = {
  'res:exotic-matter': 'i-lucide-gem',
  'res:antimatter': 'i-lucide-orbit'
}

const strategicCostList = (costs?: Partial<Record<string, number>>) =>
  Object.entries(costs ?? {})
    .filter(([, amount]) => Boolean(amount))
    .map(([key, amount]) => ({ key, amount: amount as number, icon: STRATEGIC_ICONS[key] ?? 'i-lucide-sparkles' }))

const canAffordStrategic = (costs?: Partial<Record<string, number>>): boolean => {
  if (!costs) return true
  const stock = props.playerResources?.strategic
  if (!stock) return true
  return Object.entries(costs).every(([key, amount]) => (stock[key] ?? 0) >= (amount ?? 0))
}

const queueFull = computed(() => props.star.buildQueue.length >= props.buildQueueLimit)
const canQueueBuilding = (b: BuildingDefinition) =>
  props.canBuild && !b.locked && !queueFull.value && canAfford(b.resourceCosts) && canAffordStrategic(b.strategicCosts)
const canQueueUnit = (u: UnitDefinition) =>
  props.canBuild && !u.locked && !queueFull.value && canAfford(u.resourceCosts) && canAffordStrategic(u.strategicCosts)

// Only researched items are listed (locked = research missing → hidden).
const megastructureList = computed(() => props.buildingCatalog.filter(b => !b.locked))

// ── Tooltip content (costs/yields/hints live in the row's hover tooltip) ──
const buildingYields = (b: BuildingDefinition) => {
  const out: Array<{ icon: string, amount: number }> = []
  const p = b.resourceProduction ?? {}
  if (p.energy) out.push({ icon: 'i-lucide-zap', amount: p.energy })
  if (p.minerals) out.push({ icon: 'i-lucide-pickaxe', amount: p.minerals })
  if (p.rare) out.push({ icon: 'i-lucide-atom', amount: p.rare })
  if (b.researchPoints) out.push({ icon: 'i-lucide-flask-conical', amount: b.researchPoints })
  return out
}

const costLines = (costs: BuildCosts, strategic?: Partial<Record<string, number>>) => {
  const r = props.playerResources
  const lines: Array<{ icon: string, amount: number, ok: boolean }> = []
  if (costs.energy) lines.push({ icon: 'i-lucide-zap', amount: costs.energy, ok: !r || r.energy >= costs.energy })
  if (costs.minerals) lines.push({ icon: 'i-lucide-pickaxe', amount: costs.minerals, ok: !r || r.minerals >= costs.minerals })
  if (costs.rare) lines.push({ icon: 'i-lucide-atom', amount: costs.rare, ok: !r || r.rare >= costs.rare })
  for (const sc of strategicCostList(strategic)) {
    const stock = r?.strategic?.[sc.key] ?? Number.POSITIVE_INFINITY
    lines.push({ icon: sc.icon, amount: sc.amount, ok: stock >= sc.amount })
  }
  return lines
}

const insufficientHint = (costs: BuildCosts, strategic?: Partial<Record<string, number>>): string | null =>
  (!canAfford(costs) || !canAffordStrategic(strategic)) ? t('game.slots.tooltip-insufficient') : null

const productionPerRound = computed(() => props.star.productionPerRound)
const estimateRounds = (cost: number) => (productionPerRound.value <= 0 ? 0 : Math.max(1, Math.ceil(cost / productionPerRound.value)))

// ── Placement ─────────────────────────────────────────────────────────
const placementDef = computed(() => props.buildingCatalog.find(b => b.id === placementBuildingId.value) ?? null)
const validPlacementSlots = computed(() => {
  const set = new Set<number>()
  if (!placementDef.value) return set
  for (const shell of shells.value) {
    if (shell.state === 'empty') set.add(shell.index)
  }
  return set
})

const selectBuildingForPlacement = (b: BuildingDefinition) => {
  if (!canQueueBuilding(b)) return
  placementBuildingId.value = placementBuildingId.value === b.id ? null : b.id
}

const placeAt = (slotIndex: number) => {
  const def = placementDef.value
  if (!def || !validPlacementSlots.value.has(slotIndex)) return
  emit('queue-build', props.star.id, def.id, 'building', slotIndex)
  placementBuildingId.value = null
}

const hoverPreview = computed(() => {
  const def = placementDef.value
  const index = hoveredSlotIndex.value
  if (!def || index === null || !validPlacementSlots.value.has(index)) return null
  const yields: Array<{ icon: string, label: string, amount: number }> = []
  const prod = def.resourceProduction ?? {}
  if (prod.energy) yields.push({ icon: 'i-lucide-zap', label: 'energy', amount: prod.energy })
  if (prod.minerals) yields.push({ icon: 'i-lucide-pickaxe', label: 'minerals', amount: prod.minerals })
  if (prod.rare) yields.push({ icon: 'i-lucide-atom', label: 'rare', amount: prod.rare })
  if (def.researchPoints) yields.push({ icon: 'i-lucide-flask-conical', label: 'research', amount: def.researchPoints })
  return { name: def.name, yields }
})

// ── Stellar Shipyard: units ───────────────────────────────────────────
const hasShipyard = computed(() => props.star.slots.some(s => s.buildingId === SHIPYARD_ID && !s.isConstructing))
const shipyardUnits = computed(() => props.unitCatalog.filter(u => u.requiresFacility && !u.locked))

const selectUnit = (u: UnitDefinition) => {
  if (!canQueueUnit(u)) return
  emit('queue-build', props.star.id, u.id, 'unit')
}

// ── Queue strip ───────────────────────────────────────────────────────
const queueItems = computed(() =>
  props.star.buildQueue.map((entry, index) => {
    const def = entry.kind === 'building'
      ? props.buildingCatalog.find(b => b.id === entry.id)
      : props.unitCatalog.find(u => u.id === entry.id)
    const cost = def?.productionCost ?? 0
    return {
      index,
      kind: entry.kind,
      name: def?.name ?? entry.id,
      icon: def?.icon ?? (entry.kind === 'building' ? 'i-lucide-orbit' : 'i-lucide-rocket'),
      progress: cost > 0 ? Math.min(100, Math.round((entry.productionSpent / cost) * 100)) : 0,
      roundsLeft: estimateRounds(Math.max(0, cost - entry.productionSpent)),
      isFront: index === 0
    }
  }))

const onDragStart = (index: number) => {
  dragIndex.value = index
}
const onDrop = (toIndex: number) => {
  const from = dragIndex.value
  dragIndex.value = null
  if (from === null || from === toIndex) return
  emit('reorder-queue', props.star.id, from, toIndex)
}

const getBuildingName = (id: string) => props.buildingCatalog.find(b => b.id === id)?.name ?? id
const getBuildingIcon = (id: string) => props.buildingCatalog.find(b => b.id === id)?.icon ?? 'i-lucide-orbit'
const getUnitIcon = (id: string) => props.unitCatalog.find(u => u.id === id)?.icon ?? 'i-lucide-rocket'
</script>

<template>
  <!-- Teleported to body so the overlay escapes the map container's stacking context. -->
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex overflow-hidden">
      <div
        class="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm"
        @click="emit('close')"
      />

      <!-- ═══════ Catalog rail (owner only) ═══════ -->
      <aside
        v-if="canBuild"
        class="relative z-10 flex w-80 shrink-0 flex-col border-r border-amber-900/40 bg-neutral-950/95"
      >
        <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
          <button
            type="button"
            data-testid="star-tab-megastructures"
            class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition"
            :class="catalogTab === 'buildings' ? 'bg-amber-900/50 text-amber-100' : 'text-neutral-400 hover:bg-neutral-800/60'"
            @click="catalogTab = 'buildings'"
          >
            {{ $t('game.star.tab-megastructures') }}
          </button>
          <button
            v-if="hasShipyard"
            type="button"
            data-testid="star-tab-units"
            class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition"
            :class="catalogTab === 'units' ? 'bg-amber-900/50 text-amber-100' : 'text-neutral-400 hover:bg-neutral-800/60'"
            @click="catalogTab = 'units'"
          >
            {{ $t('game.star.tab-ships') }}
          </button>
        </div>

        <p class="px-3 pt-2 text-[11px] text-neutral-500">
          {{ placementBuildingId ? $t('game.slots.placement-hint') : $t('game.star.pick-megastructure-hint') }}
        </p>

        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <template v-if="catalogTab === 'buildings'">
            <GameBuildListRow
              v-for="b in megastructureList"
              :key="b.id"
              :testid="`star-build-list-option-${b.id}`"
              :name="b.name"
              :icon="b.icon"
              :rounds="estimateRounds(b.productionCost)"
              :disabled="!canQueueBuilding(b)"
              :selected="placementBuildingId === b.id"
              accent="amber"
              :description="b.description"
              :yields="buildingYields(b)"
              :costs="costLines(b.resourceCosts, b.strategicCosts)"
              :hint="insufficientHint(b.resourceCosts, b.strategicCosts)"
              @select="selectBuildingForPlacement(b)"
            />
            <p
              v-if="!megastructureList.length"
              class="px-2 py-4 text-center text-xs text-neutral-500"
            >
              {{ $t('game.slots.none-researched') }}
            </p>
          </template>

          <template v-else>
            <GameBuildListRow
              v-for="u in shipyardUnits"
              :key="u.id"
              :testid="`star-build-list-option-${u.id}`"
              :name="u.name"
              :icon="u.icon"
              :rounds="estimateRounds(u.productionCost)"
              :disabled="!canQueueUnit(u)"
              accent="amber"
              :description="u.role"
              :costs="costLines(u.resourceCosts, u.strategicCosts)"
              :hint="insufficientHint(u.resourceCosts, u.strategicCosts)"
              @select="selectUnit(u)"
            />
            <p
              v-if="!shipyardUnits.length"
              class="px-2 py-4 text-center text-xs text-neutral-500"
            >
              {{ $t('game.slots.none-researched') }}
            </p>
          </template>
        </div>
      </aside>

      <!-- ═══════ Main column ═══════ -->
      <div class="relative z-10 flex flex-1 flex-col items-center overflow-hidden star-slot-zoom-in">
        <!-- Header -->
        <div class="flex items-center gap-4 pt-4 z-20">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-center bg-cover border-2 border-amber-400/50 star-header-glow"
              :style="{ backgroundImage: `url('/sun.webp')` }"
            />
            <div>
              <h2 class="text-lg font-bold text-neutral-100">
                {{ star.name }}
              </h2>
              <p class="text-xs text-neutral-400">
                {{ $t('game.star.subtitle') }} ·
                <span v-if="canBuild">{{ $t('game.star.owner', { owner: star.ownerLabel }) }}</span>
                <span
                  v-else
                  class="text-amber-300/80"
                >{{ $t('game.star.unclaimed') }}</span>
              </p>
            </div>
          </div>
          <span class="flex items-center gap-2 text-[11px]">
            <UIcon
              name="i-lucide-orbit"
              class="w-3.5 h-3.5 text-amber-300"
            />
            <span
              v-if="dysonLevel > 0"
              class="text-amber-200"
            >{{ $t('game.star.dyson-progress', { level: dysonLevel, max: dysonMax }) }}</span>
            <span
              v-else
              class="text-neutral-500"
            >{{ $t('game.star.dyson-empty') }}</span>
          </span>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            class="ml-2"
            data-testid="star-view-close"
            @click="emit('close')"
          />
        </div>

        <!-- Capture hint (read-only stars) -->
        <div
          v-if="!canBuild"
          class="mt-3 z-20 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200"
        >
          <UIcon
            name="i-lucide-sun"
            class="w-4 h-4"
          />
          {{ $t('game.star.capture-hint') }}
        </div>

        <!-- Star + shells canvas -->
        <div class="flex flex-1 items-center justify-center">
          <div
            class="relative"
            :style="{ width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px` }"
          >
            <div
              v-for="shell in shells"
              :key="`ring-${shell.index}`"
              class="absolute rounded-full border border-dashed border-amber-500/15 pointer-events-none"
              :style="{ width: `${shell.radius * 2}px`, height: `${shell.radius * 2}px`, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }"
            />

            <!-- Dyson hull -->
            <div
              class="absolute rounded-full pointer-events-none dyson-hull"
              :class="{ 'dyson-hull-pulse': dysonConstructing }"
              :style="{
                width: `${DYSON_RING_RADIUS * 2}px`,
                height: `${DYSON_RING_RADIUS * 2}px`,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: `conic-gradient(from -90deg, rgba(251,191,36,0.85) 0 ${dysonPercent}%, rgba(251,191,36,0.08) ${dysonPercent}% 100%)`
              }"
            />

            <!-- Star core -->
            <div
              class="absolute rounded-full overflow-hidden pointer-events-none star-core-glow"
              :style="{ width: `${STAR_RADIUS * 2}px`, height: `${STAR_RADIUS * 2}px`, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }"
            >
              <img
                src="/sun.webp"
                alt=""
                class="w-full h-full object-cover"
              >
            </div>

            <!-- Shell slots -->
            <div
              v-for="shell in shells"
              :key="`slot-${shell.index}`"
              class="absolute z-10"
              :style="{ left: `calc(50% + ${shell.px}px)`, top: `calc(50% + ${shell.py}px)`, width: `${SHELL_SLOT_SIZE * 2}px`, height: `${SHELL_SLOT_SIZE * 2}px`, transform: 'translate(-50%, -50%)' }"
              @mouseenter="hoveredSlotIndex = shell.index"
              @mouseleave="hoveredSlotIndex = null"
            >
              <button
                type="button"
                :data-testid="`star-shell-${shell.index}`"
                :data-state="shell.state"
                class="w-full h-full rounded-full transition-all duration-200 relative border bg-neutral-950"
                :class="[
                  placementBuildingId && validPlacementSlots.has(shell.index) ? 'cursor-pointer scale-110 border-amber-300/80' : 'cursor-default border-amber-500/40'
                ]"
                @click="placeAt(shell.index)"
              >
                <div
                  class="absolute inset-0 rounded-full transition-colors duration-200"
                  :class="{
                    'bg-amber-950/70': shell.state === 'empty',
                    'bg-amber-900/70': shell.state === 'under-construction',
                    'bg-amber-900/50': shell.state === 'completed'
                  }"
                />
                <div
                  v-if="placementBuildingId && validPlacementSlots.has(shell.index)"
                  class="absolute inset-0.5 rounded-full border-2 border-amber-300/80 animate-pulse"
                />
                <div
                  v-if="shell.state === 'empty'"
                  class="absolute inset-0 flex items-center justify-center"
                >
                  <UIcon
                    v-if="canBuild"
                    name="i-lucide-plus"
                    class="w-5 h-5"
                    :class="placementBuildingId && validPlacementSlots.has(shell.index) ? 'text-amber-200' : 'text-amber-500/50'"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-lock"
                    class="w-4 h-4 text-neutral-600"
                  />
                </div>
                <div
                  v-if="(shell.state === 'completed' || shell.state === 'under-construction') && shell.buildingId"
                  class="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
                >
                  <UIcon
                    :name="getBuildingIcon(shell.buildingId)"
                    class="w-5 h-5"
                    :class="shell.state === 'completed' ? 'text-amber-200' : 'text-warning-300'"
                  />
                  <span
                    v-if="shell.state === 'completed'"
                    class="text-[8px] text-amber-200/80 text-center leading-tight px-1 max-w-full truncate"
                  >{{ getBuildingName(shell.buildingId) }}</span>
                  <span
                    v-else
                    class="text-[9px] text-warning-200 font-semibold"
                  >{{ shell.queueIndex !== undefined ? `#${shell.queueIndex + 1}` : `${shell.progress}%` }}</span>
                </div>
              </button>
            </div>

            <!-- Placement hover preview -->
            <Transition name="fade">
              <div
                v-if="hoverPreview"
                data-testid="star-placement-preview"
                class="absolute left-1/2 top-0 z-30 -translate-x-1/2 px-3 py-2 rounded-lg border border-amber-500/40 bg-neutral-900 shadow-xl text-xs max-w-72 pointer-events-none"
              >
                <p class="font-semibold text-amber-100 mb-1">
                  {{ hoverPreview.name }}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    v-for="y in hoverPreview.yields"
                    :key="y.label"
                    class="flex items-center gap-0.5 text-success-300"
                  >
                    <UIcon
                      :name="y.icon"
                      class="w-3 h-3"
                    />+{{ y.amount }}
                  </span>
                  <span
                    v-if="!hoverPreview.yields.length"
                    class="text-neutral-500"
                  >{{ $t('game.slots.no-base-yield') }}</span>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Stationed units -->
        <div
          v-if="canBuild && star.stationedUnits.length"
          class="flex items-center gap-2 pb-2 z-20"
        >
          <span class="text-[11px] text-neutral-500 uppercase tracking-wider mr-1">
            {{ $t('game.star.shipyard-title') }}
          </span>
          <div
            v-for="(unit, idx) in star.stationedUnits"
            :key="idx"
            class="relative w-10 h-10 rounded-md border border-amber-700/40 bg-amber-950/40 flex flex-col items-center justify-center gap-0.5"
          >
            <UIcon
              :name="getUnitIcon(unit.unitDefId)"
              class="w-4 h-4 text-amber-200"
            />
            <span
              v-if="unit.count > 1"
              class="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-neutral-700 border border-neutral-600 rounded-full w-4.5 h-4.5 flex items-center justify-center text-neutral-200"
            >{{ unit.count }}</span>
          </div>
        </div>

        <!-- ═══════ Queue strip ═══════ -->
        <div
          v-if="canBuild"
          data-testid="star-build-queue"
          class="flex w-full items-center gap-2 border-t border-amber-900/40 bg-neutral-950/95 px-4 py-3 overflow-x-auto"
        >
          <span class="text-[11px] text-neutral-500 uppercase tracking-wider shrink-0">
            {{ $t('game.slots.queue-title') }} {{ star.buildQueue.length }}/{{ buildQueueLimit }}
          </span>
          <div
            v-if="queueItems.length === 0"
            class="text-sm text-neutral-500"
          >
            {{ $t('game.slots.queue-empty') }}
          </div>
          <div
            v-for="item in queueItems"
            :key="item.index"
            :data-testid="`star-queue-item-${item.index}`"
            draggable="true"
            class="relative flex items-center gap-2 rounded-md border bg-neutral-900/80 px-2 py-1.5 shrink-0 cursor-grab active:cursor-grabbing"
            :class="item.isFront ? 'border-amber-500/50' : 'border-neutral-700/50'"
            @dragstart="onDragStart(item.index)"
            @dragover.prevent
            @drop="onDrop(item.index)"
          >
            <UIcon
              :name="item.icon"
              class="h-4 w-4 shrink-0 text-amber-200"
            />
            <div class="min-w-0">
              <p class="text-xs font-medium text-neutral-100 truncate max-w-32">
                {{ item.name }}
              </p>
              <div
                v-if="item.isFront"
                class="flex items-center gap-1.5 mt-0.5"
              >
                <div class="h-1 w-20 rounded-full bg-neutral-700/60 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-amber-500 transition-all"
                    :style="{ width: `${item.progress}%` }"
                  />
                </div>
                <span class="text-[9px] text-neutral-400">{{ $t('game.common.duration-rounds', { count: item.roundsLeft }) }}</span>
              </div>
              <span
                v-else
                class="text-[9px] text-neutral-500"
              >{{ $t('game.common.duration-rounds', { count: item.roundsLeft }) }}</span>
            </div>
            <button
              type="button"
              :data-testid="`star-queue-item-cancel-${item.index}`"
              class="ml-1 text-neutral-500 hover:text-critical-300 transition"
              @click="emit('remove-queue-item', star.id, item.index)"
            >
              <UIcon
                name="i-lucide-x"
                class="h-3.5 w-3.5"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.star-slot-zoom-in {
  animation: starSlotZoomIn 0.8s cubic-bezier(.1, .8, .46, 1);
}

@keyframes starSlotZoomIn {
  0% { transform: scale(0.3); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

.star-core-glow {
  box-shadow:
    0 0 60px 18px rgba(251, 191, 36, 0.35),
    0 0 120px 50px rgba(251, 146, 60, 0.18);
}

.star-header-glow {
  box-shadow: 0 0 12px 2px rgba(251, 191, 36, 0.4);
}

.dyson-hull {
  -webkit-mask: radial-gradient(transparent 58%, #000 60%);
  mask: radial-gradient(transparent 58%, #000 60%);
  filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.3));
}

.dyson-hull-pulse {
  animation: dysonPulse 1.6s ease-in-out infinite;
}

@keyframes dysonPulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 0.55; }
}
</style>

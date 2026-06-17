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
  locked?: boolean
  lockedByTechName?: string | null
}

interface StarData {
  id: string
  name: string
  owner: string
  ownerLabel: string
  workers: number
  productionPerWorker: number
  slots: Array<{ buildingId: string | null, buildingLevel: number, isConstructing: boolean, constructionTimeLeft: number, zone: string, resourceNode: string | null }>
  buildQueue: Array<{ id: string, kind: 'building' | 'unit', productionSpent: number, resourcePaid: boolean, slotIndex?: number }>
}

interface PlayerResources {
  energy: number
  minerals: number
  rare: number
}

const props = defineProps<{
  star: StarData
  /** Megastructure catalog (site: 'star' buildings only). */
  buildingCatalog: BuildingDefinition[]
  /** Whether the viewer controls this star (false → read-only capture hint). */
  canBuild: boolean
  playerResources?: PlayerResources
}>()

const emit = defineEmits<{
  'close': []
  'queue-build': [planetId: string, buildId: string, kind: 'building' | 'unit', slotIndex?: number]
}>()

const DYSON_ID = 'bld:dyson-sphere'

// ── Layout ────────────────────────────────────────────────────────────
const STAR_RADIUS = 90
const SHELL_BASE_RADIUS = 150
const SHELL_STEP = 48
const SHELL_SLOT_SIZE = 48
const DYSON_RING_RADIUS = 118
// Each shell sits at its own radius; nodes fan around the star (top/right/bottom/left).
const SHELL_ANGLES = [-90, 0, 90, 180]
const CANVAS_SIZE = (SHELL_BASE_RADIUS + (STAR_SLOT_COUNT - 1) * SHELL_STEP + SHELL_SLOT_SIZE + 36) * 2

// ── Local (per-turn-plan) assignment overlay ──────────────────────────
const assignments = ref(new Map<number, string>())
const buildMenuSlotIndex = ref<number | null>(null)
const hoveredSlotIndex = ref<number | null>(null)

watch(() => props.star.id, () => {
  assignments.value = new Map()
  buildMenuSlotIndex.value = null
  hoveredSlotIndex.value = null
})

type ShellSlot = {
  index: number
  radius: number
  px: number
  py: number
  state: 'empty' | 'under-construction' | 'completed'
  buildingId: BuildingId | null
  progress: number
}

const shells = computed<ShellSlot[]>(() => {
  return Array.from({ length: STAR_SLOT_COUNT }, (_, index) => {
    const radius = SHELL_BASE_RADIUS + index * SHELL_STEP
    const angle = (SHELL_ANGLES[index] ?? (index * 60 - 90)) * (Math.PI / 180)
    const px = Math.cos(angle) * radius
    const py = Math.sin(angle) * radius
    const serverSlot = props.star.slots[index]
    const local = assignments.value.get(index)

    const base = { index, radius, px, py }

    if (local) {
      const def = props.buildingCatalog.find(b => b.id === local)
      const cost = def?.productionCost ?? 1
      const isResume = serverSlot?.buildingId === local && serverSlot?.isConstructing
      const spent = isResume ? Math.max(0, cost - (serverSlot?.constructionTimeLeft ?? 0)) : 0
      return { ...base, state: 'under-construction' as const, buildingId: local as BuildingId, progress: Math.min(100, Math.round((spent / cost) * 100)) }
    }
    if (serverSlot?.buildingId && !serverSlot.isConstructing) {
      return { ...base, state: 'completed' as const, buildingId: serverSlot.buildingId as BuildingId, progress: 100 }
    }
    if (serverSlot?.buildingId && serverSlot.isConstructing) {
      const def = props.buildingCatalog.find(b => b.id === serverSlot.buildingId)
      const cost = def?.productionCost ?? 1
      const spent = Math.max(0, cost - serverSlot.constructionTimeLeft)
      return { ...base, state: 'under-construction' as const, buildingId: serverSlot.buildingId as BuildingId, progress: Math.min(100, Math.round((spent / cost) * 100)) }
    }
    return { ...base, state: 'empty' as const, buildingId: null, progress: 0 }
  })
})

// ── Dyson hull: the signature closing-shell visual ────────────────────
const dysonMax = computed(() => props.buildingCatalog.find(b => b.id === DYSON_ID)?.maxLevel ?? 5)
const dysonLevel = computed(() => {
  let level = 0
  for (const slot of props.star.slots) {
    if (slot.buildingId === DYSON_ID && !slot.isConstructing) {
      level = Math.max(level, slot.buildingLevel)
    }
  }
  return level
})
const dysonConstructing = computed(() =>
  props.star.slots.some(s => s.buildingId === DYSON_ID && s.isConstructing)
  || [...assignments.value.values()].includes(DYSON_ID))
const dysonPercent = computed(() => Math.round((dysonLevel.value / dysonMax.value) * 100))

// ── Build menu ────────────────────────────────────────────────────────
const openBuildMenu = (slotIndex: number) => {
  if (!props.canBuild) return
  buildMenuSlotIndex.value = slotIndex
}
const closeBuildMenu = () => {
  buildMenuSlotIndex.value = null
}

const buildMenuPosition = computed(() => {
  if (buildMenuSlotIndex.value === null) return { x: 0, y: 0 }
  const shell = shells.value.find(s => s.index === buildMenuSlotIndex.value)
  return shell ? { x: shell.px, y: shell.py } : { x: 0, y: 0 }
})

const canAfford = (costs: BuildCosts): boolean => {
  if (!props.playerResources) return true
  return props.playerResources.energy >= costs.energy
    && props.playerResources.minerals >= costs.minerals
    && props.playerResources.rare >= costs.rare
}

const isAlreadyPaid = (buildId: string, slotIndex: number): boolean => {
  const serverSlot = props.star.slots[slotIndex]
  if (serverSlot?.buildingId === buildId && serverSlot.isConstructing) return true
  return props.star.buildQueue.some(b => b.id === buildId && b.slotIndex === slotIndex)
}

const handleBuild = (buildingId: string, slotIndex: number) => {
  assignments.value = new Map([[slotIndex, buildingId]])
  emit('queue-build', props.star.id, buildingId, 'building', slotIndex)
  closeBuildMenu()
}

const productionPerRound = computed(() => props.star.workers * props.star.productionPerWorker)
const estimateRounds = (productionCost: number) => {
  if (productionPerRound.value <= 0) return 0
  return Math.max(1, Math.ceil(productionCost / productionPerRound.value))
}

const getBuildingName = (id: string) => props.buildingCatalog.find(b => b.id === id)?.name ?? id
const getBuildingIcon = (id: string) => props.buildingCatalog.find(b => b.id === id)?.icon ?? 'i-lucide-orbit'
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm"
      @click="emit('close')"
    />

    <div class="relative flex flex-col items-center gap-4 star-slot-zoom-in">
      <!-- Header -->
      <div class="flex items-center gap-4 z-20">
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
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          class="ml-4"
          data-testid="star-view-close"
          @click="emit('close')"
        />
      </div>

      <!-- Dyson progress chip -->
      <div class="flex items-center gap-2 z-20 text-[11px]">
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
      </div>

      <!-- Capture hint (read-only stars) -->
      <div
        v-if="!canBuild"
        class="z-20 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200"
      >
        <UIcon
          name="i-lucide-sun"
          class="w-4 h-4"
        />
        {{ $t('game.star.capture-hint') }}
      </div>

      <!-- Star + shells canvas -->
      <div
        class="relative z-10"
        :style="{ width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px` }"
      >
        <!-- Concentric shell guide lines -->
        <div
          v-for="shell in shells"
          :key="`ring-${shell.index}`"
          class="absolute rounded-full border border-dashed border-amber-500/15 pointer-events-none"
          :style="{
            width: `${shell.radius * 2}px`,
            height: `${shell.radius * 2}px`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }"
        />

        <!-- Dyson hull: a ring whose arc closes as stages complete -->
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
          :style="{
            width: `${STAR_RADIUS * 2}px`,
            height: `${STAR_RADIUS * 2}px`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }"
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
          :style="{
            left: `calc(50% + ${shell.px}px)`,
            top: `calc(50% + ${shell.py}px)`,
            width: `${SHELL_SLOT_SIZE * 2}px`,
            height: `${SHELL_SLOT_SIZE * 2}px`,
            transform: 'translate(-50%, -50%)'
          }"
          @mouseenter="hoveredSlotIndex = shell.index"
          @mouseleave="hoveredSlotIndex = null"
        >
          <button
            type="button"
            :data-testid="`star-shell-${shell.index}`"
            :data-state="shell.state"
            class="w-full h-full rounded-full transition-all duration-200 relative border bg-neutral-950"
            :class="[
              shell.state === 'empty' && canBuild
                ? 'cursor-pointer border-amber-500/30 hover:border-amber-400/60'
                : 'cursor-default border-amber-500/40',
              hoveredSlotIndex === shell.index && shell.state === 'empty' && canBuild ? 'scale-110' : ''
            ]"
            @click="shell.state === 'empty' && openBuildMenu(shell.index)"
          >
            <div
              class="absolute inset-0 rounded-full transition-colors duration-200"
              :class="{
                'bg-amber-950/70 hover:bg-amber-900/50': shell.state === 'empty',
                'bg-amber-900/70': shell.state === 'under-construction',
                'bg-amber-900/50': shell.state === 'completed'
              }"
            />
            <!-- Empty -->
            <div
              v-if="shell.state === 'empty'"
              class="absolute inset-0 flex items-center justify-center"
            >
              <UIcon
                v-if="canBuild"
                name="i-lucide-plus"
                class="w-5 h-5 text-amber-500/50 transition-colors"
                :class="{ 'text-amber-300': hoveredSlotIndex === shell.index }"
              />
              <UIcon
                v-else
                name="i-lucide-lock"
                class="w-4 h-4 text-neutral-600"
              />
            </div>
            <!-- Completed -->
            <div
              v-if="shell.state === 'completed' && shell.buildingId"
              class="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
            >
              <UIcon
                :name="getBuildingIcon(shell.buildingId)"
                class="w-5 h-5 text-amber-200"
              />
              <span class="text-[8px] text-amber-200/80 text-center leading-tight px-1 max-w-full truncate">
                {{ getBuildingName(shell.buildingId) }}
              </span>
            </div>
            <!-- Under construction -->
            <div
              v-if="shell.state === 'under-construction' && shell.buildingId"
              class="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
            >
              <UIcon
                :name="getBuildingIcon(shell.buildingId)"
                class="w-4 h-4 text-warning-300 animate-pulse"
              />
              <span class="text-[9px] text-warning-200 font-semibold">
                {{ shell.progress }}%
              </span>
            </div>
          </button>
        </div>

        <!-- Build menu -->
        <Transition name="fade">
          <div
            v-if="buildMenuSlotIndex !== null"
            class="absolute z-40 w-72 rounded-lg border border-amber-500/30 bg-neutral-900 shadow-2xl shadow-amber-500/10 overflow-hidden"
            :style="{
              left: `calc(50% + ${buildMenuPosition.x + 90}px)`,
              top: `calc(50% + ${buildMenuPosition.y}px)`,
              transform: 'translateY(-50%)'
            }"
          >
            <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50">
              <span class="text-sm font-semibold text-neutral-200">
                {{ $t('game.star.choose-megastructure') }}
              </span>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="closeBuildMenu()"
              />
            </div>
            <div class="max-h-64 overflow-y-auto p-2 space-y-1">
              <button
                v-for="building in buildingCatalog"
                :key="building.id"
                type="button"
                :data-testid="`star-build-option-${building.id}`"
                class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-neutral-800/70"
                :class="{ 'opacity-40 cursor-not-allowed': building.locked || (!isAlreadyPaid(building.id, buildMenuSlotIndex!) && !canAfford(building.resourceCosts)) }"
                :disabled="building.locked || (!isAlreadyPaid(building.id, buildMenuSlotIndex!) && !canAfford(building.resourceCosts))"
                @click="handleBuild(building.id, buildMenuSlotIndex!)"
              >
                <div class="flex h-8 w-8 items-center justify-center rounded-md bg-amber-900/40 shrink-0">
                  <UIcon
                    :name="building.icon"
                    class="h-4 w-4 text-amber-200"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-neutral-100 truncate">
                    {{ building.name }}
                  </p>
                  <div class="flex items-center gap-2 text-[10px] text-neutral-500">
                    <span
                      v-if="building.resourceCosts.energy"
                      class="flex items-center gap-0.5"
                    >
                      <UIcon
                        name="i-lucide-zap"
                        class="w-2.5 h-2.5 text-warning-300"
                      />
                      {{ building.resourceCosts.energy }}
                    </span>
                    <span
                      v-if="building.resourceCosts.minerals"
                      class="flex items-center gap-0.5"
                    >
                      <UIcon
                        name="i-lucide-pickaxe"
                        class="w-2.5 h-2.5 text-neutral-300"
                      />
                      {{ building.resourceCosts.minerals }}
                    </span>
                    <span
                      v-if="building.resourceCosts.rare"
                      class="flex items-center gap-0.5"
                    >
                      <UIcon
                        name="i-lucide-atom"
                        class="w-2.5 h-2.5 text-primary-300"
                      />
                      {{ building.resourceCosts.rare }}
                    </span>
                    <span class="text-neutral-600">·</span>
                    <span>{{ $t('game.common.duration-rounds', { count: estimateRounds(building.productionCost) }) }}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Back button -->
      <UButton
        :label="$t('game.star.back-to-system')"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        class="z-10"
        @click="emit('close')"
      />
    </div>
  </div>
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

/* Ring shape: punch a transparent hole so the conic-gradient reads as a shell. */
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

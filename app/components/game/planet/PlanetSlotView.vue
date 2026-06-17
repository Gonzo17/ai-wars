<script setup lang="ts">
import type { BuildingId, Planet, ResourceNodeType } from '~~/shared/types/game'
import type { AdjacencyBonus, PlanetSlot, SlotZone } from '~~/shared/types/planetSlots'
import {
  ORBITAL_BUILDING_IDS,
  ORBITAL_SLOT_COUNT,
  SURFACE_SLOT_COORDS,
  computeAdjacencyBonuses,
  isSurfaceBuilding
} from '~~/shared/types/planetSlots'
import { activeSynergies } from '~~/shared/utils/synergies'

interface BuildCosts {
  energy: number
  minerals: number
  rare: number
}

type BuildingCategory = 'energy' | 'minerals' | 'rare' | 'military' | 'research' | 'infrastructure'

interface BuildingDefinition {
  id: string
  name: string
  description: string
  category: BuildingCategory
  maxLevel: number
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
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

interface PlanetData {
  id: string
  name: string
  owner: string
  ownerLabel: string
  type: string
  typeLabel: string
  size: string
  sizeLabel: string
  systemId: string
  systemName: string
  workers: number
  productionPerWorker: number
  buildings: Array<{ id: string, level: number, isConstructing?: boolean }>
  slots: Array<{ buildingId: string | null, buildingLevel: number, isConstructing: boolean, constructionTimeLeft: number, zone: string, resourceNode: string | null }>
  buildQueue: Array<{ id: string, kind: 'building' | 'unit', productionSpent: number, resourcePaid: boolean, slotIndex?: number }>
  stationedUnits: Array<{ unitDefId: string, count: number }>
}

interface PlayerResources {
  energy: number
  minerals: number
  rare: number
  strategic?: Record<string, number>
}

const props = defineProps<{
  planet: PlanetData
  buildingCatalog: BuildingDefinition[]
  unitCatalog: UnitDefinition[]
  playerResources?: PlayerResources
}>()

const emit = defineEmits<{
  'close': []
  'queue-build': [planetId: string, buildId: string, kind: 'building' | 'unit', slotIndex?: number]
}>()

// ── Layout constants ──────────────────────────────────────────────────
const PLANET_RADIUS = 150
const HEX_SIZE = 48
const HEX_GAP = 6
const ORBITAL_RING_RADIUS = PLANET_RADIUS + 70
const ORBITAL_SLOT_SIZE = 44

// ── Local slot → building assignments (for current turn plan) ─────────
const surfaceAssignments = ref(new Map<number, string>())
const orbitalAssignments = ref(new Map<number, string>())
const unitAssignment = ref<string | null>(null)
const unitTrainingMenuOpen = ref(false)

// ── Surface slots: server state + local assignment overlay ────────────
const surfaceSlots = computed<PlanetSlot[]>(() => {
  return SURFACE_SLOT_COORDS.map((coord, index) => {
    const serverSlot = props.planet.slots[index]
    const resourceNode = (serverSlot?.resourceNode as ResourceNodeType) ?? null
    const localAssignment = surfaceAssignments.value.get(index)

    // Local assignment takes priority (current turn plan)
    if (localAssignment) {
      const def = props.buildingCatalog.find(b => b.id === localAssignment)
      const cost = def?.productionCost ?? 1
      // If server already had this building under construction, carry progress
      const isResume = serverSlot?.buildingId === localAssignment && serverSlot?.isConstructing
      const spent = isResume ? Math.max(0, cost - (serverSlot?.constructionTimeLeft ?? 0)) : 0
      return {
        index,
        coord,
        zone: 'surface' as const,
        state: 'under-construction' as const,
        buildingId: localAssignment as BuildingId,
        progress: Math.min(100, Math.round((spent / cost) * 100)),
        resourceNode
      }
    }

    // Server state: completed building
    if (serverSlot?.buildingId && !serverSlot.isConstructing) {
      return {
        index,
        coord,
        zone: 'surface' as const,
        state: 'completed' as const,
        buildingId: serverSlot.buildingId as BuildingId,
        progress: 100,
        resourceNode
      }
    }

    // Server state: building under construction (from previous turn queue)
    if (serverSlot?.buildingId && serverSlot.isConstructing) {
      const def = props.buildingCatalog.find(b => b.id === serverSlot.buildingId)
      const cost = def?.productionCost ?? 1
      const spent = Math.max(0, cost - serverSlot.constructionTimeLeft)
      return {
        index,
        coord,
        zone: 'surface' as const,
        state: 'under-construction' as const,
        buildingId: serverSlot.buildingId as BuildingId,
        progress: Math.min(100, Math.round((spent / cost) * 100)),
        resourceNode
      }
    }

    return {
      index,
      coord,
      zone: 'surface' as const,
      state: 'empty' as const,
      buildingId: null,
      progress: 0,
      resourceNode
    }
  })
})

// ── Orbital slots: ring around planet, server state + local overlay ───
const orbitalSlots = computed<PlanetSlot[]>(() => {
  return Array.from({ length: ORBITAL_SLOT_COUNT }, (_, index) => {
    const globalIndex = SURFACE_SLOT_COORDS.length + index
    const serverSlot = props.planet.slots[globalIndex]
    const localAssignment = orbitalAssignments.value.get(index)

    if (localAssignment) {
      const def = props.buildingCatalog.find(b => b.id === localAssignment)
      const cost = def?.productionCost ?? 1
      const isResume = serverSlot?.buildingId === localAssignment && serverSlot?.isConstructing
      const spent = isResume ? Math.max(0, cost - (serverSlot?.constructionTimeLeft ?? 0)) : 0
      return {
        index: globalIndex,
        coord: { q: 0, r: 0 },
        zone: 'orbital' as const,
        state: 'under-construction' as const,
        buildingId: localAssignment as BuildingId,
        progress: Math.min(100, Math.round((spent / cost) * 100)),
        resourceNode: null
      }
    }

    if (serverSlot?.buildingId && !serverSlot.isConstructing) {
      return {
        index: globalIndex,
        coord: { q: 0, r: 0 },
        zone: 'orbital' as const,
        state: 'completed' as const,
        buildingId: serverSlot.buildingId as BuildingId,
        progress: 100,
        resourceNode: null
      }
    }

    if (serverSlot?.buildingId && serverSlot.isConstructing) {
      const def = props.buildingCatalog.find(b => b.id === serverSlot.buildingId)
      const cost = def?.productionCost ?? 1
      const spent = Math.max(0, cost - serverSlot.constructionTimeLeft)
      return {
        index: globalIndex,
        coord: { q: 0, r: 0 },
        zone: 'orbital' as const,
        state: 'under-construction' as const,
        buildingId: serverSlot.buildingId as BuildingId,
        progress: Math.min(100, Math.round((spent / cost) * 100)),
        resourceNode: null
      }
    }

    return {
      index: globalIndex,
      coord: { q: 0, r: 0 },
      zone: 'orbital' as const,
      state: 'empty' as const,
      buildingId: null,
      progress: 0,
      resourceNode: null
    }
  })
})

// ── Surface hex → pixel positioning ───────────────────────────────────
const hexToPixel = (q: number, r: number) => {
  const size = HEX_SIZE + HEX_GAP / 2
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r)
  const y = size * (1.5 * r)
  return { x, y }
}

type PositionedSlot = PlanetSlot & { px: number, py: number }

const surfacePositions = computed<PositionedSlot[]>(() => {
  return surfaceSlots.value.map((slot) => {
    const { x, y } = hexToPixel(slot.coord.q, slot.coord.r)
    return { ...slot, px: x, py: y }
  })
})

// ── Orbital slot positions on ring ────────────────────────────────────
const orbitalPositions = computed<PositionedSlot[]>(() => {
  return orbitalSlots.value.map((slot, i) => {
    const angle = (2 * Math.PI * i) / ORBITAL_SLOT_COUNT - Math.PI / 2
    const px = Math.cos(angle) * ORBITAL_RING_RADIUS
    const py = Math.sin(angle) * ORBITAL_RING_RADIUS
    return { ...slot, px, py }
  })
})

// ── All slots for tooltip logic ───────────────────────────────────────
const allPositions = computed(() => [...surfacePositions.value, ...orbitalPositions.value])

// ── Hover / build menu state ──────────────────────────────────────────
const hoveredSlotIndex = ref<number | null>(null)
const buildMenuSlotIndex = ref<number | null>(null)
const buildMenuZone = ref<SlotZone>('surface')

// The component instance is reused when the user switches planets, so all local
// (per-turn-plan) state must be reset on planet change — otherwise the previous
// planet's pending builds and open menus bleed into the new one.
watch(() => props.planet.id, () => {
  surfaceAssignments.value = new Map()
  orbitalAssignments.value = new Map()
  unitAssignment.value = null
  unitTrainingMenuOpen.value = false
  buildMenuSlotIndex.value = null
  hoveredSlotIndex.value = null
})

const hoveredSlot = computed(() => {
  if (hoveredSlotIndex.value === null) return null
  return allPositions.value.find(s => s.index === hoveredSlotIndex.value) ?? null
})

const hoveredAdjacencyBonuses = computed<AdjacencyBonus[]>(() => {
  if (!hoveredSlot.value) return []
  if (hoveredSlot.value.state !== 'empty') return []
  if (hoveredSlot.value.zone !== 'surface') return []
  return computeAdjacencyBonuses(
    hoveredSlot.value.index,
    'bld:mining-facility' as BuildingId,
    surfaceSlots.value
  )
})

// ── Build catalogs per zone ───────────────────────────────────────────
const surfaceBuildingCatalog = computed(() =>
  props.buildingCatalog.filter(b => isSurfaceBuilding(b.id as BuildingId))
)

const orbitalBuildingCatalog = computed(() =>
  props.buildingCatalog.filter(b => ORBITAL_BUILDING_IDS.includes(b.id as BuildingId))
)

const activeBuildCatalog = computed(() =>
  buildMenuZone.value === 'surface'
    ? surfaceBuildingCatalog.value
    : orbitalBuildingCatalog.value
)

// ── Build menu logic ──────────────────────────────────────────────────
const openBuildMenu = (slotIndex: number, zone: SlotZone) => {
  buildMenuSlotIndex.value = slotIndex
  buildMenuZone.value = zone
}

const closeBuildMenu = () => {
  buildMenuSlotIndex.value = null
}

const buildMenuPosition = computed(() => {
  if (buildMenuSlotIndex.value === null) return { x: 0, y: 0 }
  const pos = allPositions.value.find(s => s.index === buildMenuSlotIndex.value)
  if (!pos) return { x: 0, y: 0 }
  return { x: pos.px, y: pos.py }
})

const previewBonuses = (buildingId: string, slotIndex: number): AdjacencyBonus[] => {
  if (buildMenuZone.value === 'orbital') return []
  return computeAdjacencyBonuses(slotIndex, buildingId as BuildingId, surfaceSlots.value)
}

const synergyLabelKeys: Record<string, string> = {
  'ore-extraction': 'game.slots.synergy-ore',
  'power-grid': 'game.slots.synergy-power',
  'compute-uplink': 'game.slots.synergy-compute'
}

// Which production synergies a building would trigger if placed in this slot.
const previewSynergies = (buildingId: string, slotIndex: number): string[] => {
  const planet = { slots: props.planet.slots } as unknown as Planet
  return activeSynergies(planet, slotIndex, buildingId as BuildingId)
    .map(type => synergyLabelKeys[type])
    .filter((key): key is string => Boolean(key))
}

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

const isAlreadyPaid = (buildId: string, slotIndex: number): boolean => {
  // Check if this slot already has this building under construction (resources were paid)
  const serverSlot = props.planet.slots[slotIndex]
  if (serverSlot?.buildingId === buildId && serverSlot.isConstructing) return true
  // Check if it's in the current queue override
  return props.planet.buildQueue.some(b => b.id === buildId && b.slotIndex === slotIndex)
}

const handleBuild = (buildingId: string, slotIndex: number) => {
  // Clear ALL previous assignments (only one active build per planet)
  surfaceAssignments.value = new Map()
  orbitalAssignments.value = new Map()
  unitAssignment.value = null
  unitTrainingMenuOpen.value = false

  if (buildMenuZone.value === 'surface') {
    surfaceAssignments.value.set(slotIndex, buildingId)
  } else {
    const orbitalLocalIndex = slotIndex - SURFACE_SLOT_COORDS.length
    orbitalAssignments.value.set(orbitalLocalIndex, buildingId)
  }
  emit('queue-build', props.planet.id, buildingId, 'building', slotIndex)
  closeBuildMenu()
}

const handleTrainUnit = (unitId: string) => {
  // Clear ALL building assignments (buildings + units share one queue)
  surfaceAssignments.value = new Map()
  orbitalAssignments.value = new Map()
  unitAssignment.value = unitId
  unitTrainingMenuOpen.value = false
  emit('queue-build', props.planet.id, unitId, 'unit')
}

const activeBuildDisplay = computed(() => {
  const queueItem = props.planet.buildQueue[0]
  if (!queueItem) return null

  if (queueItem.kind === 'building') {
    const def = props.buildingCatalog.find(b => b.id === queueItem.id)
    if (!def) return null
    const totalCost = def.productionCost
    const spent = queueItem.productionSpent
    const progress = totalCost > 0 ? Math.min(100, Math.round((spent / totalCost) * 100)) : 0
    return {
      id: queueItem.id,
      kind: 'building' as const,
      name: def.name,
      icon: def.icon,
      progress,
      roundsLeft: estimateRounds(totalCost - spent)
    }
  }

  if (queueItem.kind === 'unit') {
    const def = props.unitCatalog.find(u => u.id === queueItem.id)
    if (!def) return null
    const totalCost = def.productionCost
    const spent = queueItem.productionSpent
    const progress = totalCost > 0 ? Math.min(100, Math.round((spent / totalCost) * 100)) : 0
    return {
      id: queueItem.id,
      kind: 'unit' as const,
      name: def.name,
      icon: def.icon,
      progress,
      roundsLeft: estimateRounds(totalCost - spent)
    }
  }

  return null
})

const getUnitName = (unitId: string): string => {
  const def = props.unitCatalog.find(u => u.id === unitId)
  return def?.name ?? unitId
}

const getUnitIcon = (unitId: string): string => {
  const def = props.unitCatalog.find(u => u.id === unitId)
  return def?.icon ?? 'i-lucide-rocket'
}

const canTrainUnit = (unit: UnitDefinition): boolean => {
  if (!unit.requiresFacility) return true
  return props.planet.slots.some(s => s.buildingId === 'bld:orbital-dock' && !s.isConstructing)
}

// ── Building name helpers ─────────────────────────────────────────────
const getBuildingName = (buildingId: string): string => {
  const def = props.buildingCatalog.find(b => b.id === buildingId)
  return def?.name ?? buildingId
}

const getBuildingIcon = (buildingId: string): string => {
  const def = props.buildingCatalog.find(b => b.id === buildingId)
  return def?.icon ?? 'i-lucide-hammer'
}

const productionPerRound = computed(() => props.planet.workers * props.planet.productionPerWorker)

const KNOWN_PLANET_TYPES = new Set(['terrestrial', 'gas-giant', 'ice-giant', 'barren', 'oceanic', 'desert'])
const planetImageSrc = computed(() =>
  `/planets/${KNOWN_PLANET_TYPES.has(props.planet.type) ? props.planet.type : 'terrestrial'}.webp`)

const estimateRounds = (productionCost: number) => {
  if (productionPerRound.value <= 0) return 0
  return Math.max(1, Math.ceil(productionCost / productionPerRound.value))
}

const hexClipPath = 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)'

const resourceNodeIcons: Record<ResourceNodeType, string> = {
  'ore': 'i-lucide-mountain',
  'exotic-matter': 'i-lucide-gem',
  'antimatter': 'i-lucide-orbit'
}

const resourceNodeLabels: Record<ResourceNodeType, string> = {
  'ore': 'Ore',
  'exotic-matter': 'Exotic Matter',
  'antimatter': 'Antimatter'
}

const CANVAS_SIZE = (ORBITAL_RING_RADIUS + ORBITAL_SLOT_SIZE + 32) * 2
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
    <!-- Backdrop (stars) -->
    <div
      class="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm"
      @click="emit('close')"
    />

    <!-- Main zoom-in container -->
    <div class="relative flex flex-col items-center gap-4 planet-slot-zoom-in">
      <!-- Header -->
      <div class="flex items-center gap-4 z-20">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-full bg-center bg-cover border-2 border-primary-500/40"
            :style="{ backgroundImage: `url('${planetImageSrc}')` }"
          />
          <div>
            <h2 class="text-lg font-bold text-neutral-100">
              {{ planet.name }}
            </h2>
            <p class="text-xs text-neutral-400">
              {{ planet.typeLabel }} · {{ planet.sizeLabel }} · {{ planet.ownerLabel }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-4 ml-4 text-xs text-neutral-400">
          <span class="flex items-center gap-1">
            <UIcon
              name="i-lucide-hammer"
              class="w-3.5 h-3.5 text-primary-300"
            />
            {{ productionPerRound }}/{{ $t('game.slots.round-short') }}
          </span>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          class="ml-4"
          data-testid="slot-view-close"
          @click="emit('close')"
        />
      </div>

      <!-- Zone legend -->
      <div class="flex items-center gap-5 z-20 text-[11px] text-neutral-500">
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-2.5 h-2.5 rounded-sm bg-neutral-700/80" />
          {{ $t('game.slots.zone-surface') }}
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-2.5 h-2.5 rounded-full border border-sky-500/50 bg-sky-900/40" />
          {{ $t('game.slots.zone-orbital') }}
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon
            name="i-lucide-mountain"
            class="w-3 h-3 text-amber-400"
          />
          {{ $t('game.slots.legend-resource') }}
        </span>
      </div>

      <!-- Build Queue Bar -->
      <div class="flex items-center gap-3 px-4 py-2 rounded-lg border border-neutral-700/40 bg-neutral-900/60 z-20 min-w-80">
        <template v-if="activeBuildDisplay">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-md shrink-0"
            :class="activeBuildDisplay.kind === 'building' ? 'bg-primary-900/50' : 'bg-sky-900/50'"
          >
            <UIcon
              :name="activeBuildDisplay.icon"
              class="h-5 w-5"
              :class="activeBuildDisplay.kind === 'building' ? 'text-primary-200' : 'text-sky-200'"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-neutral-100 truncate">
                {{ activeBuildDisplay.name }}
              </p>
              <UBadge
                :color="activeBuildDisplay.kind === 'building' ? 'primary' : 'info'"
                variant="subtle"
                size="xs"
              >
                {{ activeBuildDisplay.kind === 'building' ? $t('game.slots.badge-building') : $t('game.slots.badge-unit') }}
              </UBadge>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <div class="flex-1 h-1.5 rounded-full bg-neutral-700/60 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="activeBuildDisplay.kind === 'building' ? 'bg-primary-500' : 'bg-sky-500'"
                  :style="{ width: `${activeBuildDisplay.progress}%` }"
                />
              </div>
              <span class="text-[10px] text-neutral-400 shrink-0">
                {{ activeBuildDisplay.progress }}% · {{ $t('game.common.duration-rounds', { count: activeBuildDisplay.roundsLeft }) }}
              </span>
            </div>
          </div>
        </template>
        <template v-else>
          <UIcon
            name="i-lucide-hammer"
            class="h-5 w-5 text-neutral-600"
          />
          <span class="text-sm text-neutral-500">
            {{ $t('game.slots.no-active-build') }}
          </span>
        </template>
      </div>

      <!-- Planet + slots canvas -->
      <div
        class="relative z-10"
        :style="{ width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px` }"
      >
        <!-- Orbital ring line -->
        <div
          class="absolute rounded-full border border-dashed border-sky-500/20 pointer-events-none"
          :style="{
            width: `${ORBITAL_RING_RADIUS * 2}px`,
            height: `${ORBITAL_RING_RADIUS * 2}px`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }"
        />

        <!-- Planet sphere (behind everything) -->
        <div
          class="absolute rounded-full overflow-hidden pointer-events-none planet-glow"
          :style="{
            width: `${PLANET_RADIUS * 2}px`,
            height: `${PLANET_RADIUS * 2}px`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }"
        >
          <img
            :src="planetImageSrc"
            alt=""
            class="w-full h-full object-cover opacity-70"
          >
          <!-- Atmosphere gradient overlay -->
          <div class="absolute inset-0 rounded-full bg-linear-to-b from-transparent via-transparent to-primary-950/60" />
        </div>

        <!-- ═══════ SURFACE SLOTS (hex grid on planet) ═══════ -->
        <div
          v-for="slotPos in surfacePositions"
          :key="`s-${slotPos.index}`"
          class="absolute z-10"
          :style="{
            left: `calc(50% + ${slotPos.px}px)`,
            top: `calc(50% + ${slotPos.py}px)`,
            width: `${HEX_SIZE * 2}px`,
            height: `${HEX_SIZE * 2}px`,
            transform: 'translate(-50%, -50%)'
          }"
          @mouseenter="hoveredSlotIndex = slotPos.index"
          @mouseleave="hoveredSlotIndex = null"
        >
          <button
            type="button"
            :data-testid="`surface-slot-${slotPos.index}`"
            :data-state="slotPos.state"
            class="w-full h-full transition-all duration-200 relative"
            :class="[
              slotPos.state === 'empty' ? 'cursor-pointer' : 'cursor-default',
              hoveredSlotIndex === slotPos.index && slotPos.state === 'empty' ? 'scale-110' : ''
            ]"
            :style="{ clipPath: hexClipPath }"
            @click="slotPos.state === 'empty' && openBuildMenu(slotPos.index, 'surface')"
          >
            <!-- Hex background -->
            <div
              class="absolute inset-0 transition-colors duration-200"
              :class="{
                'bg-neutral-800/50 hover:bg-neutral-700/60': slotPos.state === 'empty' && !slotPos.resourceNode,
                'bg-amber-900/30 hover:bg-amber-800/40': slotPos.state === 'empty' && slotPos.resourceNode,
                'bg-primary-900/50': slotPos.state === 'under-construction',
                'bg-primary-800/40': slotPos.state === 'completed'
              }"
            />
            <!-- Hover border -->
            <div
              v-if="hoveredSlotIndex === slotPos.index"
              class="absolute inset-0.5 border-2 border-primary-400/60"
              :style="{ clipPath: hexClipPath }"
            />
            <!-- Empty slot: + icon (always visible when empty) -->
            <div
              v-if="slotPos.state === 'empty'"
              class="absolute inset-0 flex items-center justify-center"
            >
              <UIcon
                name="i-lucide-plus"
                class="w-6 h-6 text-neutral-500/70 transition-colors"
                :class="{ 'text-primary-300': hoveredSlotIndex === slotPos.index }"
              />
            </div>
            <!-- Resource node marker (small badge in top-left, ON the hex) -->
            <div
              v-if="slotPos.resourceNode && slotPos.state === 'empty'"
              class="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none"
            >
              <UIcon
                :name="resourceNodeIcons[slotPos.resourceNode]"
                class="w-4 h-4 text-amber-400/80"
              />
            </div>
            <!-- Completed building -->
            <div
              v-if="slotPos.state === 'completed' && slotPos.buildingId"
              class="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
            >
              <UIcon
                :name="getBuildingIcon(slotPos.buildingId)"
                class="w-5 h-5 text-primary-200"
              />
              <span class="text-[9px] text-neutral-200 text-center leading-tight px-1 max-w-full truncate">
                {{ getBuildingName(slotPos.buildingId) }}
              </span>
              <!-- Resource node overlay when building present -->
              <div
                v-if="slotPos.resourceNode"
                class="absolute top-1 right-2"
              >
                <UIcon
                  :name="resourceNodeIcons[slotPos.resourceNode]"
                  class="w-3 h-3 text-amber-400/60"
                />
              </div>
            </div>
            <!-- Under construction -->
            <div
              v-if="slotPos.state === 'under-construction' && slotPos.buildingId"
              class="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
            >
              <UIcon
                :name="getBuildingIcon(slotPos.buildingId)"
                class="w-4 h-4 text-warning-300 animate-pulse"
              />
              <span class="text-[9px] text-warning-200 font-semibold">
                {{ slotPos.progress }}%
              </span>
              <div
                class="absolute bottom-0 left-0 right-0 bg-warning-500/20 transition-all duration-500"
                :style="{ height: `${slotPos.progress}%`, clipPath: hexClipPath }"
              />
              <!-- Resource node overlay when building under construction -->
              <div
                v-if="slotPos.resourceNode"
                class="absolute top-1 right-2"
              >
                <UIcon
                  :name="resourceNodeIcons[slotPos.resourceNode]"
                  class="w-3 h-3 text-amber-400/60"
                />
              </div>
            </div>
          </button>
        </div>

        <!-- ═══════ ORBITAL SLOTS (ring around planet) ═══════ -->
        <div
          v-for="slotPos in orbitalPositions"
          :key="`o-${slotPos.index}`"
          class="absolute z-10"
          :style="{
            left: `calc(50% + ${slotPos.px}px)`,
            top: `calc(50% + ${slotPos.py}px)`,
            width: `${ORBITAL_SLOT_SIZE * 2}px`,
            height: `${ORBITAL_SLOT_SIZE * 2}px`,
            transform: 'translate(-50%, -50%)'
          }"
          @mouseenter="hoveredSlotIndex = slotPos.index"
          @mouseleave="hoveredSlotIndex = null"
        >
          <button
            type="button"
            class="w-full h-full rounded-full transition-all duration-200 relative border bg-neutral-950"
            :class="[
              slotPos.state === 'empty'
                ? 'cursor-pointer border-sky-500/30 hover:border-sky-400/60'
                : 'cursor-default border-sky-500/40',
              hoveredSlotIndex === slotPos.index && slotPos.state === 'empty' ? 'scale-110' : ''
            ]"
            @click="slotPos.state === 'empty' && openBuildMenu(slotPos.index, 'orbital')"
          >
            <!-- Background -->
            <div
              class="absolute inset-0 rounded-full transition-colors duration-200"
              :class="{
                'bg-sky-950/80 hover:bg-sky-900/60': slotPos.state === 'empty',
                'bg-sky-900/70': slotPos.state === 'under-construction',
                'bg-sky-900/50': slotPos.state === 'completed'
              }"
            />
            <!-- Hover glow -->
            <div
              v-if="hoveredSlotIndex === slotPos.index"
              class="absolute inset-0.5 rounded-full border border-sky-400/50"
            />
            <!-- Empty: + icon -->
            <div
              v-if="slotPos.state === 'empty'"
              class="absolute inset-0 flex items-center justify-center"
            >
              <UIcon
                name="i-lucide-plus"
                class="w-5 h-5 text-sky-500/50 transition-colors"
                :class="{ 'text-sky-300': hoveredSlotIndex === slotPos.index }"
              />
            </div>
            <!-- Completed -->
            <div
              v-if="slotPos.state === 'completed' && slotPos.buildingId"
              class="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
            >
              <UIcon
                :name="getBuildingIcon(slotPos.buildingId)"
                class="w-5 h-5 text-sky-200"
              />
              <span class="text-[8px] text-sky-200/80 text-center leading-tight px-1 max-w-full truncate">
                {{ getBuildingName(slotPos.buildingId) }}
              </span>
            </div>
            <!-- Under construction -->
            <div
              v-if="slotPos.state === 'under-construction' && slotPos.buildingId"
              class="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
            >
              <UIcon
                :name="getBuildingIcon(slotPos.buildingId)"
                class="w-4 h-4 text-warning-300 animate-pulse"
              />
              <span class="text-[9px] text-warning-200 font-semibold">
                {{ slotPos.progress }}%
              </span>
            </div>
          </button>
        </div>

        <!-- ═══════ TOOLTIP ═══════ -->
        <Transition name="fade">
          <div
            v-if="hoveredSlot"
            class="absolute z-30 pointer-events-none px-4 py-3 rounded-lg border border-neutral-700/60 bg-neutral-900 shadow-xl text-sm max-w-72"
            :style="{
              left: `calc(50% + ${hoveredSlot.px}px)`,
              top: `calc(50% + ${hoveredSlot.py - (hoveredSlot.zone === 'orbital' ? ORBITAL_SLOT_SIZE : HEX_SIZE) - 12}px)`,
              transform: 'translateX(-50%)'
            }"
          >
            <!-- Zone badge -->
            <div class="mb-1">
              <span
                v-if="hoveredSlot.zone === 'surface'"
                class="text-[10px] text-neutral-500 uppercase tracking-wider"
              >
                {{ $t('game.slots.zone-surface') }}
              </span>
              <span
                v-else
                class="text-[10px] text-sky-400/80 uppercase tracking-wider"
              >
                {{ $t('game.slots.zone-orbital') }}
              </span>
            </div>

            <template v-if="hoveredSlot.state === 'empty'">
              <p class="text-neutral-300 font-semibold">
                {{ $t('game.slots.empty-slot') }}
              </p>
              <p class="text-neutral-500 mt-0.5">
                {{ $t('game.slots.click-to-build') }}
              </p>
              <div
                v-if="hoveredSlot.resourceNode"
                class="mt-1 flex items-center gap-1.5 text-amber-300"
              >
                <UIcon
                  :name="resourceNodeIcons[hoveredSlot.resourceNode]"
                  class="w-3.5 h-3.5"
                />
                <span>{{ $t('game.slots.resource-node', { type: resourceNodeLabels[hoveredSlot.resourceNode] }) }}</span>
              </div>
              <div
                v-if="hoveredAdjacencyBonuses.length > 0"
                class="mt-1 space-y-0.5"
              >
                <div
                  v-for="bonus in hoveredAdjacencyBonuses"
                  :key="bonus.type"
                  class="flex items-center gap-1 text-emerald-400"
                >
                  <UIcon
                    name="i-lucide-sparkles"
                    class="w-3 h-3"
                  />
                  <span>{{ $t('game.slots.adjacency-ore-bonus') }}</span>
                </div>
              </div>
            </template>
            <template v-else-if="hoveredSlot.state === 'under-construction' && hoveredSlot.buildingId">
              <p class="text-warning-300 font-semibold">
                {{ getBuildingName(hoveredSlot.buildingId) }}
              </p>
              <p class="text-neutral-400 mt-0.5">
                {{ $t('game.slots.under-construction') }} · {{ hoveredSlot.progress }}%
              </p>
            </template>
            <template v-else-if="hoveredSlot.state === 'completed' && hoveredSlot.buildingId">
              <p class="text-primary-200 font-semibold">
                {{ getBuildingName(hoveredSlot.buildingId) }}
              </p>
              <p class="text-neutral-400 mt-0.5">
                {{ $t('game.slots.completed') }}
              </p>
            </template>
          </div>
        </Transition>

        <!-- ═══════ BUILD MENU ═══════ -->
        <Transition name="fade">
          <div
            v-if="buildMenuSlotIndex !== null"
            class="absolute z-40 w-72 rounded-lg border bg-neutral-900 shadow-2xl overflow-hidden"
            :class="buildMenuZone === 'orbital'
              ? 'border-sky-500/30 shadow-sky-500/10'
              : 'border-primary-500/30 shadow-primary-500/10'"
            :style="{
              left: `calc(50% + ${buildMenuPosition.x + 90}px)`,
              top: `calc(50% + ${buildMenuPosition.y}px)`,
              transform: 'translateY(-50%)'
            }"
          >
            <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50">
              <span class="text-sm font-semibold text-neutral-200">
                {{ buildMenuZone === 'orbital'
                  ? $t('game.slots.choose-orbital')
                  : $t('game.slots.choose-building')
                }}
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
                v-for="building in activeBuildCatalog"
                :key="building.id"
                type="button"
                :data-testid="`build-option-${building.id}`"
                class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-neutral-800/70"
                :class="{ 'opacity-40 cursor-not-allowed': building.locked || (!isAlreadyPaid(building.id, buildMenuSlotIndex!) && !(canAfford(building.resourceCosts) && canAffordStrategic(building.strategicCosts))) }"
                :disabled="building.locked || (!isAlreadyPaid(building.id, buildMenuSlotIndex!) && !(canAfford(building.resourceCosts) && canAffordStrategic(building.strategicCosts)))"
                @click="handleBuild(building.id, buildMenuSlotIndex!)"
              >
                <div class="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-800/80 shrink-0">
                  <UIcon
                    :name="building.icon"
                    class="h-4 w-4 text-primary-200"
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
                    <span
                      v-for="sc in strategicCostList(building.strategicCosts)"
                      :key="sc.key"
                      class="flex items-center gap-0.5 text-fuchsia-300"
                    >
                      <UIcon
                        :name="sc.icon"
                        class="w-2.5 h-2.5"
                      />
                      {{ sc.amount }}
                    </span>
                    <span class="text-neutral-600">·</span>
                    <span>{{ $t('game.common.duration-rounds', { count: estimateRounds(building.productionCost) }) }}</span>
                  </div>
                  <div
                    v-if="building.locked"
                    class="flex items-center gap-1 mt-0.5 text-[10px] text-info-300"
                  >
                    <UIcon
                      name="i-lucide-lock"
                      class="w-2.5 h-2.5"
                    />
                    <span class="truncate">{{ $t('game.slots.requires-research', { tech: building.lockedByTechName ?? '?' }) }}</span>
                  </div>
                </div>
                <!-- Synergy + ore-cost badge previews -->
                <div class="flex flex-col items-end gap-1 shrink-0">
                  <UBadge
                    v-for="synergyKey in previewSynergies(building.id, buildMenuSlotIndex!)"
                    :key="synergyKey"
                    color="primary"
                    variant="subtle"
                    size="xs"
                  >
                    <UIcon
                      name="i-lucide-zap"
                      class="w-3 h-3 mr-0.5"
                    />
                    {{ $t(synergyKey) }}
                  </UBadge>
                  <UBadge
                    v-if="buildMenuZone === 'surface' && previewBonuses(building.id, buildMenuSlotIndex!).length > 0"
                    color="success"
                    variant="subtle"
                    size="xs"
                  >
                    <UIcon
                      name="i-lucide-sparkles"
                      class="w-3 h-3 mr-0.5"
                    />
                    {{ $t('game.slots.ore-bonus-badge') }}
                  </UBadge>
                </div>
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Stationed Units Panel -->
      <div class="flex items-center gap-2 z-20">
        <span class="text-[11px] text-neutral-500 uppercase tracking-wider mr-1">
          {{ $t('game.slots.units-title') }}
        </span>
        <div
          v-for="(unit, idx) in planet.stationedUnits"
          :key="idx"
          class="relative w-11 h-11 rounded-md border border-neutral-700/50 bg-neutral-800/60 flex flex-col items-center justify-center gap-0.5 cursor-default"
        >
          <UIcon
            :name="getUnitIcon(unit.unitDefId)"
            class="w-4 h-4 text-sky-200"
          />
          <span class="text-[8px] text-neutral-400 truncate max-w-10 text-center leading-tight">
            {{ getUnitName(unit.unitDefId) }}
          </span>
          <span
            v-if="unit.count > 1"
            class="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-neutral-700 border border-neutral-600 rounded-full w-4.5 h-4.5 flex items-center justify-center text-neutral-200"
          >
            {{ unit.count }}
          </span>
        </div>
        <span
          v-if="planet.stationedUnits.length === 0"
          class="text-[11px] text-neutral-600 mr-2"
        >
          {{ $t('game.slots.no-units') }}
        </span>
        <div class="relative">
          <button
            type="button"
            class="w-11 h-11 rounded-md border border-dashed border-neutral-600/50 bg-neutral-800/30 flex items-center justify-center transition-colors"
            :class="unitTrainingMenuOpen ? 'border-primary-400/60 bg-neutral-700/40' : 'hover:border-primary-400/60 hover:bg-neutral-700/40'"
            @click="unitTrainingMenuOpen = !unitTrainingMenuOpen"
          >
            <UIcon
              name="i-lucide-plus"
              class="w-4 h-4"
              :class="unitTrainingMenuOpen ? 'text-primary-300' : 'text-neutral-500'"
            />
          </button>
          <!-- Unit Training Menu -->
          <Transition name="fade">
            <div
              v-if="unitTrainingMenuOpen"
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-sky-500/30 bg-neutral-900 shadow-2xl shadow-sky-500/10 overflow-hidden z-50"
            >
              <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50">
                <span class="text-sm font-semibold text-neutral-200">
                  {{ $t('game.slots.choose-unit') }}
                </span>
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="unitTrainingMenuOpen = false"
                />
              </div>
              <div class="max-h-48 overflow-y-auto p-2 space-y-1">
                <button
                  v-for="unit in unitCatalog"
                  :key="unit.id"
                  type="button"
                  class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-neutral-800/70"
                  :class="{ 'opacity-40 cursor-not-allowed': unit.locked || !canTrainUnit(unit) || !canAfford(unit.resourceCosts) || !canAffordStrategic(unit.strategicCosts) }"
                  :disabled="unit.locked || !canTrainUnit(unit) || !canAfford(unit.resourceCosts) || !canAffordStrategic(unit.strategicCosts)"
                  @click="handleTrainUnit(unit.id)"
                >
                  <div class="flex h-8 w-8 items-center justify-center rounded-md bg-sky-900/50 shrink-0">
                    <UIcon
                      :name="unit.icon"
                      class="h-4 w-4 text-sky-200"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-neutral-100 truncate">
                      {{ unit.name }}
                    </p>
                    <div class="flex items-center gap-2 text-[10px] text-neutral-500">
                      <span
                        v-if="unit.resourceCosts.energy"
                        class="flex items-center gap-0.5"
                      >
                        <UIcon
                          name="i-lucide-zap"
                          class="w-2.5 h-2.5 text-warning-300"
                        />
                        {{ unit.resourceCosts.energy }}
                      </span>
                      <span
                        v-if="unit.resourceCosts.minerals"
                        class="flex items-center gap-0.5"
                      >
                        <UIcon
                          name="i-lucide-pickaxe"
                          class="w-2.5 h-2.5 text-neutral-300"
                        />
                        {{ unit.resourceCosts.minerals }}
                      </span>
                      <span
                        v-if="unit.resourceCosts.rare"
                        class="flex items-center gap-0.5"
                      >
                        <UIcon
                          name="i-lucide-atom"
                          class="w-2.5 h-2.5 text-primary-300"
                        />
                        {{ unit.resourceCosts.rare }}
                      </span>
                      <span
                        v-for="sc in strategicCostList(unit.strategicCosts)"
                        :key="sc.key"
                        class="flex items-center gap-0.5 text-fuchsia-300"
                      >
                        <UIcon
                          :name="sc.icon"
                          class="w-2.5 h-2.5"
                        />
                        {{ sc.amount }}
                      </span>
                      <span class="text-neutral-600">·</span>
                      <span>{{ $t('game.common.duration-rounds', { count: estimateRounds(unit.productionCost) }) }}</span>
                    </div>
                  </div>
                  <div
                    v-if="unit.locked"
                    class="shrink-0"
                  >
                    <UBadge
                      color="info"
                      variant="subtle"
                      size="xs"
                    >
                      <UIcon
                        name="i-lucide-lock"
                        class="w-3 h-3 mr-0.5"
                      />
                      {{ $t('game.slots.requires-research', { tech: unit.lockedByTechName ?? '?' }) }}
                    </UBadge>
                  </div>
                  <div
                    v-else-if="!canTrainUnit(unit)"
                    class="shrink-0"
                  >
                    <UBadge
                      color="error"
                      variant="subtle"
                      size="xs"
                    >
                      {{ $t('game.planet.requires-orbital-dock') }}
                    </UBadge>
                  </div>
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Back button -->
      <UButton
        :label="$t('game.slots.back-to-system')"
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
.planet-slot-zoom-in {
  animation: slotZoomIn 0.8s cubic-bezier(.1, .8, .46, 1);
}

@keyframes slotZoomIn {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.planet-glow {
  box-shadow:
    0 0 60px 20px rgba(56, 189, 248, 0.08),
    0 0 120px 40px rgba(56, 189, 248, 0.04);
}
</style>

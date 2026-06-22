<script setup lang="ts">
import type { BuildingId, Planet, ResourceNodeType } from '~~/shared/types/game'
import type { PlanetSlot, SlotZone, PlanetSizeKey } from '~~/shared/types/planetSlots'
import {
  computeAdjacencyBonuses,
  surfaceHexCoords
} from '~~/shared/types/planetSlots'
import { activeSynergies } from '~~/shared/utils/synergies'
import { DISTRICT_ICONS } from '~~/shared/utils/districts'
import { DISTRICT_DEFS, findDistrictNode } from '~~/shared/defs/districts'
import { getProjectDef } from '~~/shared/defs/projects'
import type { DistrictType } from '~~/shared/types/districts'

interface BuildCosts {
  energy: number
  minerals: number
  rare: number
}

type DistrictNodeState = 'built' | 'building' | 'available' | 'locked' | 'blocked'

interface DistrictNode {
  kind: 'building' | 'unit' | 'project'
  id: string
  name: string
  description: string
  icon: string
  state: DistrictNodeState
  isBase: boolean
  resourceCosts: BuildCosts
  strategicCosts?: Partial<Record<string, number>>
  productionCost: number
  yields: Array<{ icon: string, amount: number }>
  slotIndex: number | null
  foundSlots: number[]
  lockedByTechName: string | null
  justCompleted?: boolean
}

interface DistrictGroup {
  type: string
  name: string
  icon: string
  founded: boolean
  operational: boolean
  available: boolean
  yields: Array<{ icon: string, amount: number }>
  nodes: DistrictNode[]
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
  kind: 'building' | 'unit' | 'project'
  productionSpent: number
  resourcePaid: boolean
  slotIndex?: number
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
  productionPerRound: number
  slots: Array<{ buildingId: string | null, buildingLevel: number, isConstructing: boolean, constructionTimeLeft: number, zone: string, resourceNode: string | null, districtType?: string | null, nodes?: string[] }>
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
  planet: PlanetData
  /** Districts as groups, each holding its building nodes. */
  districtCatalog: DistrictGroup[]
  unitCatalog: UnitDefinition[]
  /** Whether the viewer controls this planet (false → read-only inspection). */
  canBuild: boolean
  buildQueueLimit: number
  playerResources?: PlayerResources
}>()

const emit = defineEmits<{
  'close': []
  'queue-build': [planetId: string, buildId: string, kind: 'building' | 'unit' | 'project', slotIndex?: number]
  'remove-queue-item': [planetId: string, index: number]
  'reorder-queue': [planetId: string, from: number, to: number]
}>()

const { t } = useI18n()

// ── Layout constants ──────────────────────────────────────────────────
// Hex size is fixed; the planet SPHERE scales to contain its slots (small 4 / medium 7
// / large 14), laid out as centred rows that fit a circle.
const HEX_SIZE = 46
const HEX_GAP = 6
const ORBITAL_SLOT_SIZE = 42
const hexClipPath = 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)'

// ── Placement state ───────────────────────────────────────────────────
// The base node currently being placed (founding a district), or null.
const placementNodeId = ref<string | null>(null)
const hoveredSlotIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)

const cancelPlacement = () => {
  placementNodeId.value = null
}

watch(() => props.planet.id, () => {
  placementNodeId.value = null
  hoveredSlotIndex.value = null
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && placementNodeId.value) {
    e.stopPropagation()
    cancelPlacement()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  try {
    minimizedByPlanet.value = JSON.parse(localStorage.getItem(MIN_KEY) ?? '{}')
  } catch { /* ignore malformed storage */ }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))

// ── Minimised districts (remembered locally per planet, so the view persists) ──
const MIN_KEY = 'aoi:min-districts'
const minimizedByPlanet = ref<Record<string, string[]>>({})
const isMinimized = (type: string) => (minimizedByPlanet.value[props.planet.id] ?? []).includes(type)
const toggleMinimize = (type: string) => {
  const set = new Set(minimizedByPlanet.value[props.planet.id] ?? [])
  if (set.has(type)) set.delete(type)
  else set.add(type)
  minimizedByPlanet.value = { ...minimizedByPlanet.value, [props.planet.id]: [...set] }
  try {
    localStorage.setItem(MIN_KEY, JSON.stringify(minimizedByPlanet.value))
  } catch { /* ignore (private mode etc.) */ }
}
/** A minimised district flags an exclamation mark when it has anything buildable. */
const groupHasBuildable = (group: DistrictGroup) => group.nodes.some(n => n.state === 'available')

// ── Flat node lookup (queue + slot rendering need names/icons) ────────
const allNodes = computed(() => props.districtCatalog.flatMap(g => g.nodes))
const nodeById = computed(() => new Map(allNodes.value.map(n => [n.id, n])))
const nodeName = (id: string) => {
  const fromCatalog = nodeById.value.get(id)
  if (fromCatalog) return fromCatalog.name
  const key = `game.buildings.${id.replace('bld:', '')}.name`
  return t(key) === key ? id : t(key)
}
const nodeIcon = (id: string) => nodeById.value.get(id)?.icon ?? 'i-lucide-hammer'

// ── Slots: server state → render state ────────────────────────────────
const surfaceCount = computed(() => props.planet.slots.filter(s => s.zone === 'surface').length)
const orbitalCount = computed(() => props.planet.slots.filter(s => s.zone === 'orbital').length)
const surfaceCoords = computed(() => surfaceHexCoords(props.planet.size as PlanetSizeKey))

// A slot still empty on the server but referenced by a queued building is shown as
// "pending" (placed this turn, not yet building).
const queuedBuildingBySlot = computed(() => {
  const map = new Map<number, { buildingId: string, queueIndex: number }>()
  props.planet.buildQueue.forEach((entry, queueIndex) => {
    if (entry.kind === 'building' && entry.slotIndex !== undefined) {
      const slot = props.planet.slots[entry.slotIndex]
      if (slot && !slot.isConstructing) map.set(entry.slotIndex, { buildingId: entry.id, queueIndex })
    }
  })
  return map
})

const queueSpentBySlot = computed(() => {
  const map = new Map<number, number>()
  props.planet.buildQueue.forEach((e) => {
    if (e.kind === 'building' && e.slotIndex !== undefined) map.set(e.slotIndex, e.productionSpent)
  })
  return map
})

type RenderSlot = PlanetSlot & {
  queuedBuildingId?: string
  queueIndex?: number
  districtType?: string | null
  builtNodes?: string[]
}

const toSlot = (index: number, zone: SlotZone, resourceNode: ResourceNodeType | null): RenderSlot => {
  const serverSlot = props.planet.slots[index]
  const districtType = serverSlot?.districtType ?? null
  const builtNodes = serverSlot?.nodes ?? []
  const base = { index, coord: surfaceCoords.value[index] ?? { q: 0, r: 0 }, zone, resourceNode, districtType, builtNodes }

  // A node currently building (district node or megastructure).
  if (serverSlot?.buildingId && serverSlot.isConstructing) {
    const spent = queueSpentBySlot.value.get(index) ?? 0
    const total = spent + serverSlot.constructionTimeLeft
    const progress = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
    return { ...base, state: 'under-construction', buildingId: serverSlot.buildingId as BuildingId, progress }
  }
  // An established district sitting idle (has built nodes, nothing in progress).
  if (districtType && builtNodes.length > 0) {
    return { ...base, state: 'completed', buildingId: null, progress: 100 }
  }
  // A completed legacy building / megastructure (seeded worlds, stars).
  if (serverSlot?.buildingId && !serverSlot.isConstructing) {
    return { ...base, state: 'completed', buildingId: serverSlot.buildingId as BuildingId, progress: 100 }
  }
  // A node placed this turn onto an empty slot (queued, not yet started).
  const queued = queuedBuildingBySlot.value.get(index)
  if (queued) {
    return { ...base, state: 'under-construction', buildingId: queued.buildingId as BuildingId, progress: 0, queuedBuildingId: queued.buildingId, queueIndex: queued.queueIndex }
  }
  return { ...base, state: 'empty', buildingId: null, progress: 0, districtType: null, builtNodes: [] }
}

const surfaceSlots = computed(() =>
  surfaceCoords.value.map((_, index) => toSlot(index, 'surface', (props.planet.slots[index]?.resourceNode as ResourceNodeType) ?? null)))

const orbitalSlots = computed(() =>
  Array.from({ length: orbitalCount.value }, (_, i) => toSlot(surfaceCount.value + i, 'orbital', null)))

const allSlots = computed(() => [...surfaceSlots.value, ...orbitalSlots.value])

const hexToPixel = (q: number, r: number) => {
  const size = HEX_SIZE + HEX_GAP / 2
  return { x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r), y: size * (1.5 * r) }
}

const surfacePositions = computed(() =>
  surfaceSlots.value.map((slot) => {
    const { x, y } = hexToPixel(slot.coord.q, slot.coord.r)
    return { ...slot, px: x, py: y }
  }))

// Planet radius = far enough to contain the outermost surface hex (centre distance +
// half a hex), so the sphere hugs the slots for any planet size.
const planetRadius = computed(() => {
  const reach = Math.max(0, ...surfacePositions.value.map(p => Math.hypot(p.px, p.py)))
  return Math.round(reach + HEX_SIZE * 0.95 + 8)
})
const orbitalRingRadius = computed(() => planetRadius.value + 64)
const canvasSize = computed(() => (orbitalRingRadius.value + ORBITAL_SLOT_SIZE + 28) * 2)

const orbitalPositions = computed(() =>
  orbitalSlots.value.map((slot, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, orbitalCount.value) - Math.PI / 2
    return { ...slot, px: Math.cos(angle) * orbitalRingRadius.value, py: Math.sin(angle) * orbitalRingRadius.value }
  }))

// ── Catalog (one combined list; districts hold buildings, units and projects) ──
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

const queueFull = computed(() => props.planet.buildQueue.length >= props.buildQueueLimit)

const canQueueNode = (n: DistrictNode) =>
  props.canBuild && n.state === 'available' && !queueFull.value && canAfford(n.resourceCosts) && canAffordStrategic(n.strategicCosts)

const productionPerRound = computed(() => props.planet.productionPerRound)
const estimateRounds = (cost: number) => (productionPerRound.value <= 0 ? 0 : Math.max(1, Math.ceil(cost / productionPerRound.value)))

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

const nodeHint = (n: DistrictNode, founded: boolean): string | null => {
  if (n.state === 'built' || n.state === 'building') return null
  if (n.state === 'locked') return n.lockedByTechName ? t('game.slots.requires-tech', { tech: n.lockedByTechName }) : t('game.slots.locked')
  if (n.state === 'blocked') return founded ? t('game.slots.needs-prereq') : t('game.slots.needs-district')
  if (!canAfford(n.resourceCosts) || !canAffordStrategic(n.strategicCosts)) return t('game.slots.tooltip-insufficient')
  return null
}

// ── Node selection ────────────────────────────────────────────────────
// Founding a district uses placement (pick a slot); buildings auto-build into their
// district's slot; units and projects just queue.
const selectNode = (n: DistrictNode) => {
  if (!canQueueNode(n)) return
  if (n.kind === 'building') {
    if (n.isBase) {
      placementNodeId.value = placementNodeId.value === n.id ? null : n.id
      return
    }
    if (n.slotIndex !== null) emit('queue-build', props.planet.id, n.id, 'building', n.slotIndex)
    return
  }
  // Unit or project — built from the district, no slot.
  emit('queue-build', props.planet.id, n.id, n.kind)
}

// ── Placement (founding a district base only) ─────────────────────────
const placementNode = computed(() => allNodes.value.find(n => n.id === placementNodeId.value) ?? null)
const validPlacementSlots = computed(() => new Set(placementNode.value?.foundSlots ?? []))

const placeAt = (slotIndex: number) => {
  const node = placementNode.value
  if (!node || !validPlacementSlots.value.has(slotIndex)) return
  emit('queue-build', props.planet.id, node.id, 'building', slotIndex)
  placementNodeId.value = null
}

const synergyLabelKeys: Record<string, string> = {
  'ore-extraction': 'game.slots.synergy-ore',
  'power-grid': 'game.slots.synergy-power',
  'compute-uplink': 'game.slots.synergy-compute'
}

const previewSynergies = (buildingId: string, slotIndex: number): string[] => {
  const planet = { slots: props.planet.slots } as unknown as Planet
  return activeSynergies(planet, slotIndex, buildingId as BuildingId)
    .map(type => synergyLabelKeys[type])
    .filter((key): key is string => Boolean(key))
}

const previewHasOreBonus = (buildingId: string, slotIndex: number): boolean =>
  computeAdjacencyBonuses(slotIndex, buildingId as BuildingId, surfaceSlots.value).length > 0

// Base-yield + bonus preview shown while hovering a valid placement target.
const hoverPreview = computed(() => {
  const node = placementNode.value
  const index = hoveredSlotIndex.value
  if (!node || index === null || !validPlacementSlots.value.has(index)) return null
  const slot = allSlots.value.find(s => s.index === index)
  return {
    name: node.name,
    yields: node.yields,
    synergies: slot?.zone === 'surface' ? previewSynergies(node.id, index) : [],
    oreBonus: slot?.zone === 'surface' ? previewHasOreBonus(node.id, index) : false
  }
})

// ── Slot inspection tooltip (what's built here + its effects) ──────────
const OUTPUT_ICONS = {
  energy: 'i-lucide-zap',
  matter: 'i-lucide-pickaxe',
  research: 'i-lucide-flask-conical',
  production: 'i-lucide-hammer'
} as const

const getDistrictName = (type: string) => {
  const key = `game.districts.${type}`
  return t(key) === key ? type : t(key)
}

const slotTooltip = computed(() => {
  if (placementNodeId.value) return null
  const index = hoveredSlotIndex.value
  if (index === null) return null
  const slot = props.planet.slots[index]
  if (!slot) return null

  const districtType = slot.districtType ?? null
  const built = slot.nodes ?? []
  const constructing = slot.isConstructing && slot.buildingId ? slot.buildingId : null

  if (districtType && (built.length || constructing)) {
    const dDef = DISTRICT_DEFS[districtType as DistrictType]
    const weight = dDef?.weights?.[props.planet.type as keyof typeof dDef.weights] ?? 1
    const totals = { energy: 0, matter: 0, research: 0, production: 0 }
    let upkeep = 0
    const nodes = built.map((id) => {
      const found = findDistrictNode(id as BuildingId)
      const out = found?.node.output ?? {}
      totals.energy += Math.round((out.energy ?? 0) * weight)
      totals.matter += Math.round((out.matter ?? 0) * weight)
      totals.research += Math.round((out.research ?? 0) * weight)
      totals.production += out.production ?? 0
      upkeep += found?.node.energyUpkeep ?? 0
      return { name: nodeName(id), building: false }
    })
    if (constructing) nodes.push({ name: nodeName(constructing), building: true })
    const outputs = (['energy', 'matter', 'research', 'production'] as const)
      .filter(k => totals[k] > 0)
      .map(k => ({ icon: OUTPUT_ICONS[k], amount: totals[k] }))
    return { title: getDistrictName(districtType), nodes, outputs, upkeep }
  }

  if (slot.buildingId && !slot.isConstructing) {
    return { title: nodeName(slot.buildingId), nodes: [], outputs: [], upkeep: 0 }
  }
  return null
})

// ── Queue strip ───────────────────────────────────────────────────────
const queueItems = computed(() =>
  props.planet.buildQueue.map((entry, index) => {
    let name = entry.id
    let icon = 'i-lucide-hammer'
    let cost = 0
    if (entry.kind === 'building') {
      name = nodeName(entry.id)
      icon = nodeIcon(entry.id)
      cost = (findDistrictNode(entry.id as BuildingId)?.node.buildTime ?? 0) * 20
    } else if (entry.kind === 'project') {
      const def = getProjectDef(entry.id)
      name = nodeById.value.get(entry.id)?.name ?? entry.id
      icon = def?.icon ?? 'i-lucide-sparkles'
      cost = def?.productionCost ?? 0
    } else {
      const def = props.unitCatalog.find(u => u.id === entry.id)
      name = def?.name ?? entry.id
      icon = def?.icon ?? 'i-lucide-rocket'
      cost = def?.productionCost ?? 0
    }
    const progress = cost > 0 ? Math.min(100, Math.round((entry.productionSpent / cost) * 100)) : 0
    return {
      index,
      kind: entry.kind,
      name,
      icon,
      progress,
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
  emit('reorder-queue', props.planet.id, from, toIndex)
}

const getDistrictIcon = (type: string) => (DISTRICT_ICONS as Record<string, string>)[type] ?? 'i-lucide-layout-grid'
const getUnitIcon = (id: string) => props.unitCatalog.find(u => u.id === id)?.icon ?? 'i-lucide-rocket'

const KNOWN_PLANET_TYPES = new Set(['terrestrial', 'gas-giant', 'ice-giant', 'barren', 'oceanic', 'desert'])
const planetImageSrc = computed(() =>
  `/planets/${KNOWN_PLANET_TYPES.has(props.planet.type) ? props.planet.type : 'terrestrial'}.webp`)

const resourceNodeIcons: Record<ResourceNodeType, string> = {
  'ore': 'i-lucide-mountain',
  'exotic-matter': 'i-lucide-gem',
  'antimatter': 'i-lucide-orbit'
}

// Small icons shown inside a built district slot (a glance at how developed it is).
const slotBuiltIcons = (builtNodes: string[] | undefined) =>
  (builtNodes ?? []).slice(0, 4).map(id => nodeIcon(id))
</script>

<template>
  <div class="absolute inset-0 z-30 flex overflow-hidden">
    <div
      class="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm"
      @click="emit('close')"
    />

    <!-- ═══════ Catalog rail (owner only) — districts hold buildings/units/projects ═══ -->
    <aside
      v-if="canBuild"
      class="relative z-10 flex w-80 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950/95"
    >
      <p class="px-3 pt-3 pb-1 text-[11px] text-neutral-500">
        {{ placementNodeId ? $t('game.slots.placement-hint') : $t('game.slots.pick-district-hint') }}
      </p>

      <div class="flex-1 overflow-y-auto p-2 space-y-2">
        <div
          v-for="group in districtCatalog"
          :key="group.type"
          :data-testid="`district-group-${group.type}`"
          class="rounded-lg border"
          :class="group.founded ? 'border-primary-700/40 bg-primary-950/20' : 'border-neutral-800 bg-neutral-900/30'"
        >
          <!-- District header (click to minimise → keeps late-game lists tidy) -->
          <button
            type="button"
            :data-testid="`district-header-${group.type}`"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-neutral-800/40 rounded-lg transition"
            @click="toggleMinimize(group.type)"
          >
            <UIcon
              :name="group.icon"
              class="w-4 h-4 shrink-0"
              :class="group.founded ? 'text-primary-300' : 'text-neutral-400'"
            />
            <span class="text-sm font-semibold text-neutral-100">{{ group.name }}</span>
            <!-- Total output this district contributes (planet overview at a glance) -->
            <span
              v-if="group.yields.length"
              class="flex items-center gap-1.5 ml-2 text-[11px] text-success-300"
            >
              <span
                v-for="(y, i) in group.yields"
                :key="i"
                class="flex items-center gap-0.5"
              >
                <UIcon
                  :name="y.icon"
                  class="w-3 h-3"
                />{{ y.amount }}
              </span>
            </span>
            <!-- Minimised + something buildable → exclamation -->
            <UIcon
              v-if="isMinimized(group.type) && groupHasBuildable(group)"
              name="i-lucide-circle-alert"
              class="ml-auto w-4 h-4 text-warning-300"
            />
            <UIcon
              :name="isMinimized(group.type) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="w-3.5 h-3.5 text-neutral-500"
              :class="(isMinimized(group.type) && groupHasBuildable(group)) ? 'ml-1' : 'ml-auto'"
            />
          </button>

          <!-- Buildings, units and projects inside the district -->
          <div
            v-if="!isMinimized(group.type)"
            class="border-t border-neutral-800/60 px-1.5 py-1.5 space-y-1"
          >
            <GameBuildListRow
              v-for="n in group.nodes"
              :key="n.id"
              :testid="`build-list-option-${n.id}`"
              :name="n.name"
              :icon="n.icon"
              :rounds="estimateRounds(n.productionCost)"
              :disabled="!canQueueNode(n)"
              :selected="placementNodeId === n.id"
              :just-completed="n.justCompleted"
              :done="n.state === 'built'"
              :accent="n.kind === 'unit' ? 'sky' : n.kind === 'project' ? 'amber' : 'primary'"
              :description="n.description"
              :yields="n.yields"
              :costs="costLines(n.resourceCosts, n.strategicCosts)"
              :hint="nodeHint(n, group.operational)"
              @select="selectNode(n)"
            />
          </div>
        </div>
        <p
          v-if="!districtCatalog.length"
          class="px-2 py-4 text-center text-xs text-neutral-500"
        >
          {{ $t('game.slots.none-researched') }}
        </p>
      </div>
    </aside>

    <!-- ═══════ Main column: header + canvas + queue strip ═══════ -->
    <div class="relative z-10 flex flex-1 flex-col items-center overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-4 pt-4 z-20">
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
              {{ planet.typeLabel }} · {{ planet.sizeLabel }} ·
              <span :class="canBuild ? '' : 'text-amber-300/80'">{{ planet.ownerLabel }}</span>
            </p>
          </div>
        </div>
        <span class="flex items-center gap-1 ml-2 text-xs text-neutral-400">
          <UIcon
            name="i-lucide-hammer"
            class="w-3.5 h-3.5 text-primary-300"
          />
          {{ productionPerRound }}/{{ $t('game.slots.round-short') }}
        </span>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          class="ml-2"
          data-testid="slot-view-close"
          @click="emit('close')"
        />
      </div>

      <!-- Planet canvas -->
      <div class="flex flex-1 items-center justify-center">
        <div
          class="relative"
          :style="{ width: `${canvasSize}px`, height: `${canvasSize}px` }"
        >
          <!-- Orbital ring -->
          <div
            class="absolute rounded-full border border-dashed border-sky-500/20 pointer-events-none"
            :style="{ width: `${orbitalRingRadius * 2}px`, height: `${orbitalRingRadius * 2}px`, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }"
          />
          <!-- Planet sphere -->
          <div
            class="absolute rounded-full overflow-hidden pointer-events-none planet-glow"
            :style="{ width: `${planetRadius * 2}px`, height: `${planetRadius * 2}px`, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }"
          >
            <!-- scale-110: overfill the circle so the planet meets the ring with no gap. -->
            <img
              :src="planetImageSrc"
              alt=""
              class="w-full h-full object-cover opacity-70 scale-110"
            >
            <div class="absolute inset-0 rounded-full bg-linear-to-b from-transparent via-transparent to-primary-950/60" />
          </div>

          <!-- Surface slots -->
          <div
            v-for="slotPos in surfacePositions"
            :key="`s-${slotPos.index}`"
            class="absolute z-10"
            :style="{ left: `calc(50% + ${slotPos.px}px)`, top: `calc(50% + ${slotPos.py}px)`, width: `${HEX_SIZE * 2}px`, height: `${HEX_SIZE * 2}px`, transform: 'translate(-50%, -50%)' }"
            @mouseenter="hoveredSlotIndex = slotPos.index"
            @mouseleave="hoveredSlotIndex = null"
          >
            <button
              type="button"
              :data-testid="`surface-slot-${slotPos.index}`"
              :data-state="slotPos.state"
              class="w-full h-full transition-all duration-200 relative"
              :class="[
                placementNodeId && validPlacementSlots.has(slotPos.index) ? 'cursor-pointer scale-105' : 'cursor-default'
              ]"
              :style="{ clipPath: hexClipPath }"
              @click="placeAt(slotPos.index)"
            >
              <div
                class="absolute inset-0 transition-colors duration-200"
                :class="{
                  'bg-neutral-800/50': slotPos.state === 'empty' && !slotPos.resourceNode,
                  'bg-amber-900/30': slotPos.state === 'empty' && slotPos.resourceNode,
                  'bg-primary-900/50': slotPos.state === 'under-construction',
                  'bg-primary-800/40': slotPos.state === 'completed'
                }"
              />
              <div
                v-if="placementNodeId && validPlacementSlots.has(slotPos.index)"
                class="absolute inset-0.5 border-2 border-primary-400/80 animate-pulse"
                :style="{ clipPath: hexClipPath }"
              />
              <div
                v-if="slotPos.state === 'empty' && canBuild"
                class="absolute inset-0 flex items-center justify-center"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="w-5 h-5"
                  :class="placementNodeId && validPlacementSlots.has(slotPos.index) ? 'text-primary-200' : 'text-neutral-600/70'"
                />
              </div>
              <div
                v-if="slotPos.resourceNode && slotPos.state === 'empty'"
                class="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none"
              >
                <UIcon
                  :name="resourceNodeIcons[slotPos.resourceNode]"
                  class="w-4 h-4 text-amber-400/80"
                />
              </div>
              <!-- Built / building district: icon + the buildings inside it -->
              <div
                v-if="slotPos.districtType || ((slotPos.state === 'completed' || slotPos.state === 'under-construction') && slotPos.buildingId)"
                class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none"
              >
                <UIcon
                  :name="slotPos.districtType ? getDistrictIcon(slotPos.districtType) : nodeIcon(slotPos.buildingId!)"
                  class="w-5 h-5"
                  :class="slotPos.state === 'completed' ? 'text-primary-200' : 'text-warning-300'"
                />
                <span
                  v-if="slotPos.districtType"
                  class="text-[9px] text-neutral-200 text-center leading-tight px-1 max-w-full truncate"
                >{{ getDistrictName(slotPos.districtType) }}</span>
                <div
                  v-if="slotPos.builtNodes && slotPos.builtNodes.length"
                  class="flex items-center gap-0.5"
                >
                  <UIcon
                    v-for="(ic, i) in slotBuiltIcons(slotPos.builtNodes)"
                    :key="i"
                    :name="ic"
                    class="w-2.5 h-2.5 text-primary-300/90"
                  />
                </div>
                <span
                  v-if="slotPos.state === 'under-construction'"
                  class="text-[8px] text-warning-200 font-semibold"
                >{{ slotPos.queueIndex !== undefined ? `#${slotPos.queueIndex + 1}` : `${slotPos.progress}%` }}</span>
              </div>
            </button>
          </div>

          <!-- Orbital slots -->
          <div
            v-for="slotPos in orbitalPositions"
            :key="`o-${slotPos.index}`"
            class="absolute z-10"
            :style="{ left: `calc(50% + ${slotPos.px}px)`, top: `calc(50% + ${slotPos.py}px)`, width: `${ORBITAL_SLOT_SIZE * 2}px`, height: `${ORBITAL_SLOT_SIZE * 2}px`, transform: 'translate(-50%, -50%)' }"
            @mouseenter="hoveredSlotIndex = slotPos.index"
            @mouseleave="hoveredSlotIndex = null"
          >
            <button
              type="button"
              :data-testid="`surface-slot-${slotPos.index}`"
              :data-state="slotPos.state"
              class="w-full h-full rounded-full transition-all duration-200 relative border bg-neutral-950"
              :class="[
                placementNodeId && validPlacementSlots.has(slotPos.index) ? 'cursor-pointer scale-110 border-sky-300/80' : 'cursor-default border-sky-500/30'
              ]"
              @click="placeAt(slotPos.index)"
            >
              <div
                class="absolute inset-0 rounded-full transition-colors duration-200"
                :class="{
                  'bg-sky-950/80': slotPos.state === 'empty',
                  'bg-sky-900/70': slotPos.state === 'under-construction',
                  'bg-sky-900/50': slotPos.state === 'completed'
                }"
              />
              <div
                v-if="slotPos.state === 'empty' && canBuild"
                class="absolute inset-0 flex items-center justify-center"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="w-4 h-4"
                  :class="placementNodeId && validPlacementSlots.has(slotPos.index) ? 'text-sky-200' : 'text-sky-500/50'"
                />
              </div>
              <div
                v-if="slotPos.districtType || ((slotPos.state === 'completed' || slotPos.state === 'under-construction') && slotPos.buildingId)"
                class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none"
              >
                <UIcon
                  :name="slotPos.districtType ? getDistrictIcon(slotPos.districtType) : nodeIcon(slotPos.buildingId!)"
                  class="w-5 h-5"
                  :class="slotPos.state === 'completed' ? 'text-sky-200' : 'text-warning-300'"
                />
                <span
                  v-if="slotPos.state === 'under-construction'"
                  class="text-[8px] text-warning-200 font-semibold"
                >{{ slotPos.queueIndex !== undefined ? `#${slotPos.queueIndex + 1}` : `${slotPos.progress}%` }}</span>
                <span
                  v-else-if="slotPos.builtNodes && slotPos.builtNodes.length"
                  class="text-[8px] text-sky-100 font-semibold"
                >{{ slotPos.builtNodes.length }}</span>
              </div>
            </button>
          </div>

          <!-- Placement hover preview (base yield + bonuses) -->
          <Transition name="fade">
            <div
              v-if="hoverPreview"
              data-testid="placement-preview"
              class="absolute left-1/2 top-0 z-30 -translate-x-1/2 px-3 py-2 rounded-lg border border-primary-500/40 bg-neutral-900 shadow-xl text-xs max-w-72 pointer-events-none"
            >
              <p class="font-semibold text-primary-100 mb-1">
                {{ hoverPreview.name }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <span
                  v-for="(y, i) in hoverPreview.yields"
                  :key="i"
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
              <div
                v-if="hoverPreview.synergies.length || hoverPreview.oreBonus"
                class="mt-1 flex flex-wrap gap-1"
              >
                <UBadge
                  v-for="key in hoverPreview.synergies"
                  :key="key"
                  color="primary"
                  variant="subtle"
                  size="xs"
                >
                  {{ $t(key) }}
                </UBadge>
                <UBadge
                  v-if="hoverPreview.oreBonus"
                  color="success"
                  variant="subtle"
                  size="xs"
                >
                  {{ $t('game.slots.ore-bonus-badge') }}
                </UBadge>
              </div>
            </div>
          </Transition>

          <!-- Slot inspection tooltip (what's built here + its effects) -->
          <Transition name="fade">
            <div
              v-if="slotTooltip"
              data-testid="slot-tooltip"
              class="absolute left-1/2 top-0 z-30 -translate-x-1/2 px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl text-xs max-w-72 pointer-events-none"
            >
              <p class="font-semibold text-neutral-100 mb-1">
                {{ slotTooltip.title }}
              </p>
              <ul
                v-if="slotTooltip.nodes.length"
                class="space-y-0.5 mb-1"
              >
                <li
                  v-for="(n, i) in slotTooltip.nodes"
                  :key="i"
                  class="flex items-center gap-1 text-neutral-300"
                >
                  <UIcon
                    :name="n.building ? 'i-lucide-hammer' : 'i-lucide-dot'"
                    class="w-3 h-3"
                    :class="n.building ? 'text-warning-300' : 'text-neutral-500'"
                  />
                  <span :class="n.building ? 'text-warning-200' : ''">{{ n.name }}</span>
                </li>
              </ul>
              <div class="flex flex-wrap items-center gap-2">
                <span
                  v-for="o in slotTooltip.outputs"
                  :key="o.icon"
                  class="flex items-center gap-0.5 text-success-300"
                >
                  <UIcon
                    :name="o.icon"
                    class="w-3 h-3"
                  />+{{ o.amount }}
                </span>
                <span
                  v-if="slotTooltip.upkeep > 0"
                  class="flex items-center gap-0.5 text-critical-300"
                >
                  <UIcon
                    name="i-lucide-zap"
                    class="w-3 h-3"
                  />−{{ slotTooltip.upkeep }}/{{ $t('game.slots.round-short') }}
                </span>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Stationed units -->
      <div class="flex items-center gap-2 pb-2 z-20">
        <span class="text-[11px] text-neutral-500 uppercase tracking-wider mr-1">
          {{ $t('game.slots.units-title') }}
        </span>
        <div
          v-for="(unit, idx) in planet.stationedUnits"
          :key="idx"
          class="relative w-10 h-10 rounded-md border border-neutral-700/50 bg-neutral-800/60 flex flex-col items-center justify-center gap-0.5"
        >
          <UIcon
            :name="getUnitIcon(unit.unitDefId)"
            class="w-4 h-4 text-sky-200"
          />
          <span
            v-if="unit.count > 1"
            class="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-neutral-700 border border-neutral-600 rounded-full w-4.5 h-4.5 flex items-center justify-center text-neutral-200"
          >{{ unit.count }}</span>
        </div>
        <span
          v-if="planet.stationedUnits.length === 0"
          class="text-[11px] text-neutral-600"
        >{{ $t('game.slots.no-units') }}</span>
      </div>

      <!-- Read-only hint for planets the viewer doesn't control -->
      <div
        v-if="!canBuild"
        class="mb-2 z-20 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200"
      >
        <UIcon
          name="i-lucide-eye"
          class="w-4 h-4"
        />
        {{ $t('game.slots.read-only-hint') }}
      </div>

      <!-- ═══════ Queue strip (owner only) ═══════ -->
      <div
        v-if="canBuild"
        data-testid="build-queue"
        class="flex w-full items-center gap-2 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 overflow-x-auto"
      >
        <span class="text-[11px] text-neutral-500 uppercase tracking-wider shrink-0">
          {{ $t('game.slots.queue-title') }} {{ planet.buildQueue.length }}/{{ buildQueueLimit }}
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
          :data-testid="`queue-item-${item.index}`"
          draggable="true"
          class="group relative flex items-center gap-2 rounded-md border bg-neutral-900/80 px-2 py-1.5 shrink-0 cursor-grab active:cursor-grabbing"
          :class="item.isFront ? 'border-primary-500/50' : 'border-neutral-700/50'"
          @dragstart="onDragStart(item.index)"
          @dragover.prevent
          @drop="onDrop(item.index)"
        >
          <UIcon
            :name="item.icon"
            class="h-4 w-4 shrink-0"
            :class="item.kind === 'building' ? 'text-primary-200' : 'text-sky-200'"
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
                  class="h-full rounded-full bg-primary-500 transition-all"
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
            :data-testid="`queue-item-cancel-${item.index}`"
            class="ml-1 text-neutral-500 hover:text-critical-300 transition"
            @click="emit('remove-queue-item', planet.id, item.index)"
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
</template>

<style scoped>
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

<script setup lang="ts">
interface BuildCosts {
  energy: number
  minerals: number
  rare: number
}

type BuildingCategory = 'energy' | 'minerals' | 'rare' | 'military' | 'research' | 'infrastructure'
type UnitCategory = 'support' | 'combat'

interface BuildingDefinition {
  id: string
  name: string
  description: string
  category: BuildingCategory
  maxLevel: number
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
}

interface UnitDefinition {
  id: string
  name: string
  role: string
  category: UnitCategory
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
  requiresFacility: boolean
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
  slots: Array<{ buildingId: string | null, buildingLevel: number, isConstructing: boolean }>
  buildQueue: Array<{ id: string, kind: 'building' | 'unit', productionSpent: number, resourcePaid: boolean }>
  shipyardQueue: Array<{ id: string }>
}

interface PlayerResources {
  energy: number
  minerals: number
  rare: number
}

const props = defineProps<{
  planet: PlanetData
  buildingCatalog: BuildingDefinition[]
  unitCatalog: UnitDefinition[]
  buildQueueLimit: number
  progressMemory: Record<string, { productionSpent: number, resourcePaid: boolean }>
  showBackToOverview?: boolean
  playerResources?: PlayerResources
}>()

const emit = defineEmits<{
  'close': []
  'queue-build': [planetId: string, buildId: string, kind: 'building' | 'unit']
  'cancel-build': [planetId: string]
  'back-to-overview': []
}>()

const { t } = useI18n()

const builtLevels = computed(() => {
  const map = new Map<string, number>()
  for (const slot of props.planet.slots) {
    if (slot.buildingId && !slot.isConstructing) {
      const existing = map.get(slot.buildingId) ?? 0
      map.set(slot.buildingId, Math.max(existing, slot.buildingLevel))
    }
  }
  return map
})

const activeBuild = computed(() => props.planet.buildQueue[0])
const activeBuildDefinition = computed(() => {
  if (!activeBuild.value) return null
  if (activeBuild.value.kind === 'building') {
    return props.buildingCatalog.find(building => building.id === activeBuild.value?.id) ?? null
  }
  return props.unitCatalog.find(unit => unit.id === activeBuild.value?.id) ?? null
})
const activeProductionCost = computed(() => activeBuildDefinition.value?.productionCost ?? 0)
const activeBuildProgress = computed(() => {
  if (!activeBuild.value || activeProductionCost.value === 0) return 0
  return Math.min(100, Math.round((activeBuild.value.productionSpent / activeProductionCost.value) * 100))
})

const selectedBuildingId = ref<string | null>(props.buildingCatalog[0]?.id ?? null)

watch(() => props.planet.id, () => {
  selectedBuildingId.value = props.buildingCatalog[0]?.id ?? null
})

const selectedBuilding = computed(() => {
  if (!selectedBuildingId.value) return null
  return props.buildingCatalog.find(building => building.id === selectedBuildingId.value) ?? null
})

const selectedBuildingLevel = computed(() => {
  if (!selectedBuilding.value) return 0
  return builtLevels.value.get(selectedBuilding.value.id) ?? 0
})

const selectedUnitId = ref<string | null>(props.unitCatalog[0]?.id ?? null)

watch(() => props.planet.id, () => {
  selectedUnitId.value = props.unitCatalog[0]?.id ?? null
})

const selectedUnit = computed(() => {
  if (!selectedUnitId.value) return null
  return props.unitCatalog.find(unit => unit.id === selectedUnitId.value) ?? null
})

const tabOptions = computed(() => ([
  { key: 'buildings', label: t('game.planet.tabs.buildings') },
  { key: 'training', label: t('game.planet.tabs.training') }
] as const))

type TabKey = 'buildings' | 'training'
const activeTab = ref<TabKey>('buildings')

const hasTrainingFacility = computed(() => (builtLevels.value.get('bld:orbital-dock') ?? 0) > 0)
const trainingTabEnabled = computed(() => hasTrainingFacility.value || props.unitCatalog.some(unit => !unit.requiresFacility))

const productionPerRound = computed(() => props.planet.workers * props.planet.productionPerWorker)

const estimateRounds = (productionCost: number) => {
  if (productionPerRound.value <= 0) return 0
  return Math.max(1, Math.ceil(productionCost / productionPerRound.value))
}

const estimateRemaining = (productionCost: number, progress: number) => {
  if (productionPerRound.value <= 0) return 0
  const total = estimateRounds(productionCost)
  const done = Math.round((progress / 100) * total)
  return Math.max(1, total - done)
}

const queueBuild = (buildId: string, kind: 'building' | 'unit') => {
  emit('queue-build', props.planet.id, buildId, kind)
}

const getProgressPercent = (buildId: string, kind: 'building' | 'unit') => {
  const queueEntry = props.planet.buildQueue.find(entry => entry.id === buildId && entry.kind === kind)
  const saved = props.progressMemory[buildId]
  const spent = queueEntry?.productionSpent ?? saved?.productionSpent ?? 0
  const def = kind === 'building'
    ? props.buildingCatalog.find(building => building.id === buildId)
    : props.unitCatalog.find(unit => unit.id === buildId)
  const cost = def?.productionCost ?? 0
  if (!cost) return 0
  return Math.min(100, Math.round((spent / cost) * 100))
}

const queuedByBuilding = computed(() => {
  const map = new Map<string, { progress: number }>()
  for (const building of props.buildingCatalog) {
    map.set(building.id, { progress: getProgressPercent(building.id, 'building') })
  }
  return map
})

const queuedByUnit = computed(() => {
  const map = new Map<string, { progress: number }>()
  for (const unit of props.unitCatalog) {
    map.set(unit.id, { progress: getProgressPercent(unit.id, 'unit') })
  }
  return map
})

const buildingCategories: BuildingCategory[] = ['energy', 'minerals', 'rare', 'military', 'research', 'infrastructure']
const unitCategories: UnitCategory[] = ['support', 'combat']

const buildingCategoryIcons: Record<BuildingCategory, string> = {
  energy: 'i-lucide-zap',
  minerals: 'i-lucide-pickaxe',
  rare: 'i-lucide-atom',
  military: 'i-lucide-shield',
  research: 'i-lucide-flask-conical',
  infrastructure: 'i-lucide-factory'
}

const unitCategoryIcons: Record<UnitCategory, string> = {
  support: 'i-lucide-wrench',
  combat: 'i-lucide-swords'
}

const buildingsByCategory = computed(() => {
  const map = new Map<BuildingCategory, BuildingDefinition[]>()
  for (const category of buildingCategories) {
    const buildings = props.buildingCatalog.filter(b => b.category === category)
    if (buildings.length > 0) {
      map.set(category, buildings)
    }
  }
  return map
})

const unitsByCategory = computed(() => {
  const map = new Map<UnitCategory, UnitDefinition[]>()
  for (const category of unitCategories) {
    const units = props.unitCatalog.filter(u => u.category === category)
    if (units.length > 0) {
      map.set(category, units)
    }
  }
  return map
})

const canAfford = (costs: BuildCosts): boolean => {
  if (!props.playerResources) return true // Assume affordable if no resource data
  return props.playerResources.energy >= costs.energy
    && props.playerResources.minerals >= costs.minerals
    && props.playerResources.rare >= costs.rare
}

const canAffordEnergy = (cost: number): boolean => {
  if (!props.playerResources) return true
  return props.playerResources.energy >= cost
}

const canAffordMinerals = (cost: number): boolean => {
  if (!props.playerResources) return true
  return props.playerResources.minerals >= cost
}

const canAffordRare = (cost: number): boolean => {
  if (!props.playerResources) return true
  return props.playerResources.rare >= cost
}

const isAlreadyPaid = (buildId: string): boolean => {
  // Check if this build is in queue or has progress memory (resources already paid)
  const inQueue = props.planet.buildQueue.some(b => b.id === buildId)
  const hasPaidMemory = props.progressMemory[buildId]?.resourcePaid
  return inQueue || Boolean(hasPaidMemory)
}

const canBuildBuilding = (building: BuildingDefinition): boolean => {
  return isAlreadyPaid(building.id) || canAfford(building.resourceCosts)
}

const canBuildUnit = (unit: UnitDefinition): boolean => {
  return isAlreadyPaid(unit.id) || canAfford(unit.resourceCosts)
}
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center p-8 overflow-hidden">
    <div
      class="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
      @click="emit('close')"
    />

    <div class="relative w-full max-w-4xl h-[calc(100vh-16rem)] flex flex-col rounded-lg border border-primary-500/30 bg-neutral-900/95 shadow-lg shadow-primary-500/10 overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-700/50">
        <div class="flex items-center gap-3">
          <UIcon
            name="i-lucide-earth"
            class="w-5 h-5 text-primary-400"
          />
          <div>
            <h2 class="text-lg font-semibold text-neutral-100">
              {{ planet.name }}
            </h2>
            <div class="text-xs text-neutral-400">
              {{ planet.typeLabel }} · {{ planet.sizeLabel }} · {{ planet.ownerLabel }}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="showBackToOverview"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="emit('back-to-overview')"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="emit('close')"
          />
        </div>
      </div>

      <div class="px-5 py-4 border-b border-neutral-700/50 space-y-3">
        <div class="flex items-center justify-between text-sm text-neutral-300">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-map-pin"
              class="w-4 h-4 text-primary-300"
            />
            <span>
              {{ $t('game.planet.labels.system') }}: {{ planet.systemName }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-bot"
              class="w-4 h-4 text-primary-300"
            />
            <span>
              {{ $t('game.planet.labels.workers') }}: {{ props.planet.workers }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-hammer"
              class="w-4 h-4 text-primary-300"
            />
            <span>
              {{ $t('game.planet.labels.production') }}: {{ productionPerRound }}
            </span>
          </div>
        </div>

        <div
          v-if="activeBuild && activeBuildDefinition"
          class="relative flex items-center justify-between gap-4 rounded-lg border border-primary-500/30 px-4 py-3 overflow-hidden"
        >
          <div
            class="absolute inset-y-0 left-0 bg-primary-500/20 transition-all duration-500"
            :style="{ width: activeBuildProgress + '%' }"
          />
          <div class="relative z-10 flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-800/80">
              <UIcon
                :name="activeBuildDefinition.icon"
                class="h-4 w-4 text-primary-200"
              />
            </div>
            <span class="text-sm font-semibold text-primary-200">
              {{ activeBuildDefinition.name }}
            </span>
          </div>
          <div class="relative z-10 flex items-center gap-3 text-xs text-neutral-300">
            <span>{{ activeBuildProgress }}%</span>
            <span>·</span>
            <span>{{ $t('game.common.duration-rounds', { count: estimateRemaining(activeProductionCost, activeBuildProgress) }) }}</span>
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="$t('game.planet.cancel-build')"
              @click="emit('cancel-build', planet.id)"
            />
          </div>
        </div>

        <div
          v-else
          class="text-xs text-neutral-400"
        >
          {{ $t('game.planet.no-active-build') }}
        </div>
      </div>

      <div class="border-b border-neutral-700/50 px-5">
        <div class="flex gap-3">
          <button
            v-for="tab in tabOptions"
            :key="tab.key"
            type="button"
            class="px-3 py-2 text-sm font-semibold rounded-md transition"
            :class="[
              tab.key === activeTab ? 'bg-primary-500/10 text-primary-200' : 'text-neutral-400 hover:text-neutral-200',
              tab.key === 'training' && !trainingTabEnabled ? 'opacity-40 cursor-not-allowed' : ''
            ]"
            :disabled="tab.key === 'training' && !trainingTabEnabled"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 p-5 flex-1 min-h-0">
        <template v-if="activeTab === 'buildings'">
          <div class="space-y-4 overflow-y-auto pr-2">
            <template
              v-for="category in buildingCategories"
              :key="category"
            >
              <div
                v-if="buildingsByCategory.get(category)"
                class="space-y-2"
              >
                <h4 class="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  <UIcon
                    :name="buildingCategoryIcons[category]"
                    class="w-3.5 h-3.5"
                  />
                  {{ $t(`game.planet.categories.buildings.${category}`) }}
                </h4>
                <button
                  v-for="building in buildingsByCategory.get(category)"
                  :key="building.id"
                  type="button"
                  class="relative flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition"
                  :class="selectedBuildingId === building.id
                    ? 'border-primary-500/60 bg-primary-500/10'
                    : 'border-neutral-700/50 bg-neutral-900/70 hover:border-neutral-600/70'"
                  @click="selectedBuildingId = building.id"
                >
                  <div
                    class="absolute inset-y-0 left-0 bg-primary-500/20"
                    :style="{ width: `${queuedByBuilding.get(building.id)?.progress ?? 0}%` }"
                  />
                  <div class="relative z-10 flex h-9 w-9 items-center justify-center rounded-md bg-neutral-800/80">
                    <UIcon
                      :name="building.icon"
                      class="h-4 w-4 text-primary-200"
                    />
                  </div>
                  <div class="relative z-10 flex-1">
                    <p class="text-sm font-semibold text-neutral-100">
                      {{ building.name }}
                    </p>
                    <p class="text-[11px] text-neutral-500">
                      {{ $t('game.planet.level', { value: builtLevels.get(building.id) ?? 0, max: building.maxLevel }) }}
                    </p>
                  </div>
                  <div
                    v-if="(queuedByBuilding.get(building.id)?.progress ?? 0) > 0"
                    class="relative z-10 text-right text-[11px] text-neutral-300"
                  >
                    {{ queuedByBuilding.get(building.id)?.progress }}%
                  </div>
                </button>
              </div>
            </template>
          </div>
          <div class="lg:col-span-2">
            <div class="rounded-lg border border-neutral-700/50 bg-neutral-900/70 px-5 py-4 space-y-4">
              <div
                v-if="selectedBuilding"
                class="flex items-start justify-between gap-6"
              >
                <div>
                  <div class="flex items-center gap-2">
                    <div class="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/80">
                      <UIcon
                        :name="selectedBuilding.icon"
                        class="h-5 w-5 text-primary-200"
                      />
                    </div>
                    <div>
                      <p class="text-base font-semibold text-neutral-100">
                        {{ selectedBuilding.name }}
                      </p>
                      <p class="text-xs text-neutral-400">
                        {{ selectedBuilding.description }}
                      </p>
                    </div>
                  </div>
                  <div class="mt-3 text-xs text-neutral-400 space-y-2">
                    <div>
                      {{ $t('game.planet.level', { value: selectedBuildingLevel, max: selectedBuilding.maxLevel }) }}
                    </div>
                    <div class="flex items-center gap-3">
                      <span
                        v-if="selectedBuilding.resourceCosts.energy > 0"
                        class="flex items-center gap-1"
                      >
                        <UIcon
                          name="i-lucide-zap"
                          class="w-3 h-3 text-warning-300"
                        />
                        <span :class="!isAlreadyPaid(selectedBuilding.id) && !canAffordEnergy(selectedBuilding.resourceCosts.energy) ? 'text-red-400' : ''">
                          {{ selectedBuilding.resourceCosts.energy }}
                        </span>
                      </span>
                      <span
                        v-if="selectedBuilding.resourceCosts.minerals > 0"
                        class="flex items-center gap-1"
                      >
                        <UIcon
                          name="i-lucide-pickaxe"
                          class="w-3 h-3 text-neutral-300"
                        />
                        <span :class="!isAlreadyPaid(selectedBuilding.id) && !canAffordMinerals(selectedBuilding.resourceCosts.minerals) ? 'text-red-400' : ''">
                          {{ selectedBuilding.resourceCosts.minerals }}
                        </span>
                      </span>
                      <span
                        v-if="selectedBuilding.resourceCosts.rare > 0"
                        class="flex items-center gap-1"
                      >
                        <UIcon
                          name="i-lucide-atom"
                          class="w-3 h-3 text-primary-300"
                        />
                        <span :class="!isAlreadyPaid(selectedBuilding.id) && !canAffordRare(selectedBuilding.resourceCosts.rare) ? 'text-red-400' : ''">
                          {{ selectedBuilding.resourceCosts.rare }}
                        </span>
                      </span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="flex items-center gap-1">
                        <UIcon
                          name="i-lucide-hammer"
                          class="w-3 h-3 text-neutral-400"
                        />
                        <span>{{ selectedBuilding.productionCost }}</span>
                      </span>
                      <span class="text-neutral-600">·</span>
                      <span>{{ $t('game.common.duration-rounds', { count: estimateRounds(selectedBuilding.productionCost) }) }}</span>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-2">
                  <UButton
                    size="sm"
                    color="primary"
                    variant="soft"
                    :disabled="!selectedBuilding || !canBuildBuilding(selectedBuilding)"
                    @click="selectedBuilding && queueBuild(selectedBuilding.id, 'building')"
                  >
                    {{ $t('game.planet.actions.build') }}
                  </UButton>
                </div>
              </div>
              <div
                v-else
                class="text-xs text-neutral-400"
              >
                {{ $t('game.planet.no-building-selected') }}
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
            <div class="space-y-4 overflow-y-auto pr-2">
              <template
                v-for="category in unitCategories"
                :key="category"
              >
                <div
                  v-if="unitsByCategory.get(category)"
                  class="space-y-2"
                >
                  <h4 class="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    <UIcon
                      :name="unitCategoryIcons[category]"
                      class="w-3.5 h-3.5"
                    />
                    {{ $t(`game.planet.categories.units.${category}`) }}
                  </h4>
                  <button
                    v-for="unit in unitsByCategory.get(category)"
                    :key="unit.id"
                    type="button"
                    class="relative flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition"
                    :class="selectedUnitId === unit.id
                      ? 'border-primary-500/60 bg-primary-500/10'
                      : 'border-neutral-700/50 bg-neutral-900/70 hover:border-neutral-600/70'"
                    @click="selectedUnitId = unit.id"
                  >
                    <div
                      class="absolute inset-y-0 left-0 bg-primary-500/20"
                      :style="{ width: `${queuedByUnit.get(unit.id)?.progress ?? 0}%` }"
                    />
                    <div class="relative z-10 flex h-9 w-9 items-center justify-center rounded-md bg-neutral-800/80">
                      <UIcon
                        :name="unit.icon"
                        class="h-4 w-4 text-primary-200"
                      />
                    </div>
                    <div class="relative z-10 flex-1">
                      <p class="text-sm font-semibold text-neutral-100">
                        {{ unit.name }}
                      </p>
                      <p class="text-[11px] text-neutral-500">
                        {{ unit.role }}
                      </p>
                    </div>
                    <div
                      v-if="(queuedByUnit.get(unit.id)?.progress ?? 0) > 0"
                      class="relative z-10 text-right text-[11px] text-neutral-300"
                    >
                      {{ queuedByUnit.get(unit.id)?.progress }}%
                    </div>
                  </button>
                </div>
              </template>
            </div>
            <div class="lg:col-span-2">
              <div class="rounded-lg border border-neutral-700/50 bg-neutral-900/70 px-5 py-4 space-y-4">
                <div
                  v-if="selectedUnit"
                  class="flex items-start justify-between gap-6"
                >
                  <div>
                    <div class="flex items-center gap-2">
                      <div class="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/80">
                        <UIcon
                          :name="selectedUnit.icon"
                          class="h-5 w-5 text-primary-200"
                        />
                      </div>
                      <div>
                        <p class="text-base font-semibold text-neutral-100">
                          {{ selectedUnit.name }}
                        </p>
                        <p class="text-xs text-neutral-400">
                          {{ selectedUnit.role }}
                        </p>
                      </div>
                    </div>
                    <div class="mt-3 text-xs text-neutral-400 space-y-2">
                      <div class="flex items-center gap-3">
                        <span
                          v-if="selectedUnit.resourceCosts.energy > 0"
                          class="flex items-center gap-1"
                        >
                          <UIcon
                            name="i-lucide-zap"
                            class="w-3 h-3 text-warning-300"
                          />
                          <span :class="!isAlreadyPaid(selectedUnit.id) && !canAffordEnergy(selectedUnit.resourceCosts.energy) ? 'text-red-400' : ''">
                            {{ selectedUnit.resourceCosts.energy }}
                          </span>
                        </span>
                        <span
                          v-if="selectedUnit.resourceCosts.minerals > 0"
                          class="flex items-center gap-1"
                        >
                          <UIcon
                            name="i-lucide-pickaxe"
                            class="w-3 h-3 text-neutral-300"
                          />
                          <span :class="!isAlreadyPaid(selectedUnit.id) && !canAffordMinerals(selectedUnit.resourceCosts.minerals) ? 'text-red-400' : ''">
                            {{ selectedUnit.resourceCosts.minerals }}
                          </span>
                        </span>
                        <span
                          v-if="selectedUnit.resourceCosts.rare > 0"
                          class="flex items-center gap-1"
                        >
                          <UIcon
                            name="i-lucide-atom"
                            class="w-3 h-3 text-primary-300"
                          />
                          <span :class="!isAlreadyPaid(selectedUnit.id) && !canAffordRare(selectedUnit.resourceCosts.rare) ? 'text-red-400' : ''">
                            {{ selectedUnit.resourceCosts.rare }}
                          </span>
                        </span>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="flex items-center gap-1">
                          <UIcon
                            name="i-lucide-hammer"
                            class="w-3 h-3 text-neutral-400"
                          />
                          <span>{{ selectedUnit.productionCost }}</span>
                        </span>
                        <span class="text-neutral-600">·</span>
                        <span>{{ $t('game.common.duration-rounds', { count: estimateRounds(selectedUnit.productionCost) }) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col items-end gap-2">
                    <UButton
                      size="sm"
                      color="primary"
                      variant="soft"
                      :disabled="(selectedUnit.requiresFacility && !hasTrainingFacility) || !canBuildUnit(selectedUnit)"
                      @click="selectedUnit && queueBuild(selectedUnit.id, 'unit')"
                    >
                      {{ $t('game.planet.actions.train') }}
                    </UButton>
                    <p
                      v-if="selectedUnit.requiresFacility && !hasTrainingFacility"
                      class="text-[11px] text-neutral-500"
                    >
                      {{ $t('game.planet.requires-orbital-dock') }}
                    </p>
                  </div>
                </div>
                <div
                  v-else
                  class="text-xs text-neutral-400"
                >
                  {{ $t('game.planet.no-unit-selected') }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

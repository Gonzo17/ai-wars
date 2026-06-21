<script setup lang="ts">
interface BuildCosts {
  energy: number
  minerals: number
  rare: number
}

interface BuildingDefinition {
  id: string
  name: string
  description: string
  maxLevel: number
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
}

interface UnitDefinition {
  id: string
  name: string
  role: string
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
  requiresFacility: boolean
}

interface PlanetOverviewItem {
  id: string
  name: string
  type: string
  typeLabel: string
  size: string
  sizeLabel: string
  productionPerRound: number
  buildQueue: Array<{ id: string, kind: 'building' | 'unit', productionSpent: number, resourcePaid: boolean }>
}

const props = defineProps<{
  planets: PlanetOverviewItem[]
  buildingCatalog: BuildingDefinition[]
  unitCatalog: UnitDefinition[]
  buildQueueLimit: number
  progressMemory: Record<string, Record<string, { productionSpent: number, resourcePaid: boolean }>>
}>()

const emit = defineEmits<{
  'close': []
  'open-planet': [planetId: string]
}>()

const productionPerRound = (planet: PlanetOverviewItem) => planet.productionPerRound

const getDefinition = (kind: 'building' | 'unit', id: string) => {
  return kind === 'building'
    ? props.buildingCatalog.find(building => building.id === id)
    : props.unitCatalog.find(unit => unit.id === id)
}

const getProgressPercent = (planetId: string, entry: { id: string, kind: 'building' | 'unit', productionSpent: number }) => {
  const saved = props.progressMemory[planetId]?.[entry.id]
  const spent = entry.productionSpent ?? saved?.productionSpent ?? 0
  const def = getDefinition(entry.kind, entry.id)
  const cost = def?.productionCost ?? 0
  if (!cost) return 0
  return Math.min(100, Math.round((spent / cost) * 100))
}

// A planet wants attention only when its queue is empty (idle → wasting production).
const needsAction = (planet: PlanetOverviewItem) => planet.buildQueue.length === 0
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center p-8 overflow-hidden">
    <div
      class="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
      @click="emit('close')"
    />

    <div
      data-testid="planet-overview-panel"
      class="relative w-full max-w-5xl h-[calc(100vh-16rem)] flex flex-col rounded-lg border border-warning-500/30 bg-neutral-900/95 shadow-lg shadow-warning-500/10 overflow-hidden"
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-700/50">
        <div class="flex items-center gap-3">
          <UIcon
            name="i-lucide-earth"
            class="w-5 h-5 text-warning-400"
          />
          <div>
            <h2 class="text-lg font-semibold text-neutral-100">
              {{ $t('game.planet.overview.title') }}
            </h2>
            <div class="text-xs text-neutral-400">
              {{ $t('game.planet.overview.subtitle') }}
            </div>
          </div>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="planet-overview-close"
          @click="emit('close')"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-3">
        <button
          v-for="planet in planets"
          :key="planet.id"
          type="button"
          :data-testid="`overview-planet-${planet.id}`"
          :data-needs-action="needsAction(planet)"
          class="relative w-full rounded-lg border border-neutral-700/50 bg-neutral-900/70 px-4 py-3 text-left transition hover:border-neutral-600/70"
          @click="emit('open-planet', planet.id)"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-neutral-100">
                {{ planet.name }}
              </p>
              <p class="text-xs text-neutral-400">
                {{ planet.typeLabel }} · {{ planet.sizeLabel }} · {{ $t('game.planet.production-per-round', { value: productionPerRound(planet) }) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-neutral-400">
                {{ $t('game.planet.queue-slot', { value: planet.buildQueue.length, max: buildQueueLimit }) }}
              </span>
              <UBadge
                v-if="needsAction(planet)"
                color="warning"
                variant="solid"
                size="xs"
              >
                {{ $t('game.planet.action-needed') }}
              </UBadge>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <div
              v-if="planet.buildQueue.length === 0"
              class="text-xs text-neutral-500"
            >
              {{ $t('game.planet.no-production') }}
            </div>
            <div
              v-for="entry in planet.buildQueue"
              :key="entry.id"
              class="relative flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/80 px-2 py-1 overflow-hidden"
            >
              <div
                class="absolute inset-y-0 left-0 bg-warning-500/20"
                :style="{ width: `${getProgressPercent(planet.id, entry)}%` }"
              />
              <div class="relative z-10 flex items-center gap-2">
                <UIcon
                  :name="getDefinition(entry.kind, entry.id)?.icon ?? 'i-lucide-hammer'"
                  class="h-3.5 w-3.5 text-warning-200"
                />
                <span class="text-xs text-neutral-200">
                  {{ getDefinition(entry.kind, entry.id)?.name ?? entry.id }}
                </span>
                <span class="text-[10px] text-neutral-400">
                  {{ getProgressPercent(planet.id, entry) }}%
                </span>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

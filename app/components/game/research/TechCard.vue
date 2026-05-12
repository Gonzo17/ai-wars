<script setup lang="ts">
import type { TechDef, TechStatus, TechLockedReason } from '~~/shared/types/research'
import { RESEARCH_CATEGORY_ICONS, RESEARCH_CATEGORY_COLORS } from '~~/shared/types/research'

const props = defineProps<{
  tech: TechDef
  status: TechStatus
  lockedReasons: TechLockedReason[]
  progress?: number
  highlighted?: boolean
}>()

const emit = defineEmits<{
  (e: 'start-research' | 'highlight-prereq', techId: string): void
  (e: 'clear-highlight'): void
}>()

const store = useResearchStore()
const { t, te } = useI18n()

const techNameKey = (id: string) => `game.research.techs.${id.replace('tech:', '')}.name`
const techDescriptionKey = (id: string) => `game.research.techs.${id.replace('tech:', '')}.description`
const getTechName = (tech: TechDef) => (te(techNameKey(tech.id)) ? t(techNameKey(tech.id)) : tech.name)
const getTechDescription = (tech: TechDef) => {
  if (!tech.description) return ''
  return te(techDescriptionKey(tech.id)) ? t(techDescriptionKey(tech.id)) : tech.description
}

const categoryIcon = computed(() => RESEARCH_CATEGORY_ICONS[props.tech.category])
const categoryColor = computed(() => RESEARCH_CATEGORY_COLORS[props.tech.category])

const statusClasses = computed(() => {
  switch (props.status) {
    case 'completed':
      return 'border-success-500/40 bg-success-950/30'
    case 'researching':
      return 'border-info-500/60 bg-info-950/40 ring-1 ring-info-500/30'
    case 'available':
      return 'border-neutral-500/40 bg-neutral-800/60 hover:border-info-500/50 hover:bg-neutral-800/80'
    case 'locked':
      return 'border-neutral-700/30 bg-neutral-900/40 opacity-60'
    default:
      return 'border-neutral-700/30 bg-neutral-900/40'
  }
})

const prereqTechs = computed(() => {
  return props.tech.prerequisites.map((id) => {
    const tech = store.allTechs.find(t => t.id === id)
    return {
      id,
      name: tech ? getTechName(tech) : id,
      completed: store.isTechCompleted(id)
    }
  })
})

const requiredPoints = computed(() => store.getTechPointsRequired(props.tech.id))
const remainingRounds = computed(() => {
  if (store.researchPointsPerTurn <= 0) return 0
  if (props.status === 'researching') {
    return store.getRemainingTurns(props.tech.id)
  }
  return Math.max(1, Math.ceil(requiredPoints.value / store.researchPointsPerTurn))
})
const canSelect = computed(() => props.status === 'available' || props.status === 'researching')
</script>

<template>
  <div
    class="relative rounded-lg border p-3 transition-all duration-200"
    :class="[statusClasses, highlighted ? 'ring-2 ring-primary-500/50' : '', canSelect ? 'cursor-pointer hover:ring-1 hover:ring-info-400/40' : '']"
    @click="canSelect && emit('start-research', tech.id)"
  >
    <!-- Status Icon Overlay -->
    <div
      v-if="status === 'completed'"
      class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-success-500 flex items-center justify-center"
    >
      <UIcon
        name="i-lucide-check"
        class="w-4 h-4 text-neutral-950"
      />
    </div>
    <div
      v-else-if="status === 'locked'"
      class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center"
    >
      <UIcon
        name="i-lucide-lock"
        class="w-3 h-3 text-neutral-400"
      />
    </div>

    <!-- Header -->
    <div class="flex items-start gap-2 mb-2">
      <div
        class="w-8 h-8 rounded flex items-center justify-center shrink-0"
        :class="`bg-${categoryColor}-500/20`"
      >
        <UIcon
          :name="categoryIcon"
          class="w-4 h-4"
          :class="`text-${categoryColor}-400`"
        />
      </div>
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-medium text-neutral-100 truncate">
          {{ getTechName(tech) }}
        </h4>
        <UBadge
          :color="categoryColor as any"
          variant="subtle"
          size="xs"
          class="mt-0.5"
        >
          {{ t(`game.research.categories.${tech.category}`) }}
        </UBadge>
      </div>
    </div>

    <!-- Description -->
    <p
      v-if="tech.description"
      class="text-xs text-neutral-400 mb-2 line-clamp-2"
    >
      {{ getTechDescription(tech) }}
    </p>

    <!-- Research Time -->
    <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-500 mb-2">
      <div class="flex items-center gap-1">
        <UIcon
          name="i-lucide-clock"
          class="w-3 h-3"
        />
        <span>{{ $t('game.common.duration-rounds', { count: remainingRounds }) }}</span>
      </div>
      <div class="flex items-center gap-1">
        <UIcon
          name="i-lucide-flask-conical"
          class="w-3 h-3"
        />
        <span>{{ $t('game.research.points-cost', { value: requiredPoints }) }}</span>
      </div>
    </div>

    <!-- Prerequisites -->
    <div
      v-if="prereqTechs.length > 0"
      class="flex flex-wrap gap-1 mb-2"
    >
      <UBadge
        v-for="prereq in prereqTechs"
        :key="prereq.id"
        :color="prereq.completed ? 'success' : 'neutral'"
        variant="subtle"
        size="xs"
        class="cursor-pointer hover:opacity-80"
        @mouseenter="emit('highlight-prereq', prereq.id)"
        @mouseleave="emit('clear-highlight')"
      >
        <UIcon
          :name="prereq.completed ? 'i-lucide-check' : 'i-lucide-circle'"
          class="w-2.5 h-2.5 mr-0.5"
        />
        {{ prereq.name }}
      </UBadge>
    </div>

    <!-- Progress Bar (Researching) -->
    <div
      v-if="progress !== undefined && progress > 0 && status !== 'completed'"
      class="mb-2"
    >
      <div class="flex items-center justify-between text-xs mb-1">
        <span class="text-info-400">
          {{ status === 'researching'
            ? $t('game.research.actions.researching')
            : $t('game.research.points-label') }}
        </span>
        <span class="text-neutral-400">{{ $t('game.common.duration-rounds', { count: remainingRounds ?? 0 }) }}</span>
      </div>
      <UProgress
        :model-value="progress"
        color="info"
        size="sm"
      />
    </div>

    <!-- Locked Reasons -->
    <div
      v-if="status === 'locked' && lockedReasons.length > 0"
      class="space-y-1"
    >
      <div
        v-for="(reason, idx) in lockedReasons.slice(0, 2)"
        :key="idx"
        class="flex items-center gap-1 text-xs text-critical-400/80"
      >
        <UIcon
          :name="reason.type === 'prerequisite' ? 'i-lucide-git-branch' : reason.type === 'compute' ? 'i-lucide-cpu' : 'i-lucide-alert-circle'"
          class="w-3 h-3 shrink-0"
        />
        <span class="truncate">{{ reason.message }}</span>
      </div>
      <div
        v-if="lockedReasons.length > 2"
        class="text-xs text-neutral-500"
      >
        {{ $t('game.research.more-reasons', { count: lockedReasons.length - 2 }) }}
      </div>
    </div>
  </div>
</template>

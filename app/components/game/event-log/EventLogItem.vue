<script setup lang="ts">
const props = defineProps<{
  item: GameEvent
  expanded: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'navigate-to', entityType: string, entityId: string): void
}>()

const { t } = useI18n()
const store = useEventLogStore()

const translateParams = (params?: Record<string, string | number>): Record<string, string | number> => {
  if (!params) return {}
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === 'string' && (value.startsWith('events.') || value.startsWith('game.')) ? t(value) : value
    ])
  )
}

const translateValue = (value: string, params?: Record<string, string | number>): string => {
  if (value.startsWith('events.') || value.startsWith('game.')) {
    return t(value, params ?? {})
  }
  return value
}

const icon = computed(() => eventTypeIcons[props.item.type])
const severityColor = computed(() => eventSeverityColors[props.item.severity])
const isHighlighted = computed(() => store.highlightedEventId === props.item.id)

const title = computed(() => t(props.item.titleKey, translateParams(props.item.titleParams)))
const description = computed(() => t(props.item.descriptionKey, translateParams(props.item.descriptionParams)))
const navigateEntityType = computed(() => {
  if (props.item.type === 'research-complete') return 'research'
  if (props.item.type === 'ship-complete') return 'planet'
  return props.item.relatedEntityType
})
const navigateEntityId = computed(() => props.item.relatedEntityId)
</script>

<template>
  <div
    class="group rounded-md border transition-colors"
    :class="[
      item.read
        ? 'border-neutral-700/50 bg-neutral-800/30'
        : 'border-l-2 border-l-info-500 border-neutral-700/50 bg-neutral-800/50',
      isHighlighted && 'animate-highlight'
    ]"
  >
    <!-- Item Header (clickable) -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-700/20 transition-colors"
      @click="emit('toggle')"
    >
      <UIcon
        :name="icon"
        class="w-4 h-4 shrink-0"
        :class="severityColor"
      />
      <div class="flex-1 min-w-0">
        <p
          class="text-sm truncate"
          :class="item.read ? 'text-neutral-300 font-normal' : 'text-neutral-100 font-medium'"
        >
          {{ title }}
        </p>
        <p class="text-xs text-neutral-400 truncate">
          {{ description }}
        </p>
      </div>
      <UIcon
        name="i-lucide-chevron-down"
        class="w-4 h-4 text-neutral-500 transition-transform"
        :class="{ 'rotate-180': expanded }"
      />
    </button>

    <!-- Expanded Details -->
    <div
      v-if="expanded"
      class="px-4 pb-3 pt-1 border-t border-neutral-700/30"
    >
      <div
        v-if="item.details?.length"
        class="py-4 border-b border-neutral-700/30"
      >
        <div
          v-for="(detail, idx) in item.details"
          :key="idx"
          class="flex items-center gap-2 text-xs"
        >
          <UIcon
            v-if="detail.icon"
            :name="detail.icon"
            class="w-3 h-3 text-neutral-500"
          />
          <span class="text-neutral-400">{{ t(detail.labelKey) }}:</span>
          <span class="text-neutral-200">{{ translateValue(detail.value, detail.valueParams) }}</span>
        </div>
      </div>

      <!-- Navigate Button -->
      <div
        v-if="navigateEntityId && navigateEntityType"
        class="mt-2"
      >
        <UButton
          size="xs"
          color="info"
          variant="ghost"
          icon="i-lucide-external-link"
          @click="emit('navigate-to', navigateEntityType, navigateEntityId)"
        >
          {{ t('game.event-log.go-to', { entity: t(`game.event-log.entity-types.${navigateEntityType}`) }) }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes highlight {
  0%, 100% {
    background-color: rgb(30 41 59 / 0.5);
    box-shadow: none;
  }
  50% {
    background-color: rgb(6 182 212 / 0.2);
    box-shadow: 0 0 20px rgb(6 182 212 / 0.3);
  }
}

.animate-highlight {
  animation: highlight 0.5s ease-in-out 3;
}
</style>

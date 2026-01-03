<script setup lang="ts">
import type { GameEvent } from '~~/shared/types/events'

const props = defineProps<{
  item: GameEvent
  expanded: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'navigate-to', entityType: string, entityId: string): void
}>()

const { t } = useI18n()

const icon = computed(() => eventTypeIcons[props.item.type])
const severityColor = computed(() => eventSeverityColors[props.item.severity])

// Translate title with params
const title = computed(() => t(props.item.titleKey, props.item.titleParams ?? {}))

// Translate description with params
const description = computed(() => t(props.item.descriptionKey, props.item.descriptionParams ?? {}))

// Helper to translate detail values (some might be i18n keys)
const translateValue = (value: string, params?: Record<string, string | number>): string => {
  // Check if value looks like an i18n key (contains dots and starts with known prefix)
  if (value.startsWith('events.')) {
    return t(value, params ?? {})
  }
  return value
}
</script>

<template>
  <div
    class="group rounded-md border transition-colors"
    :class="[
      item.read
        ? 'border-slate-700/50 bg-slate-800/30'
        : 'border-l-2 border-l-cyan-500 border-slate-700/50 bg-slate-800/50'
    ]"
  >
    <!-- Item Header (clickable) -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/20 transition-colors"
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
          :class="item.read ? 'text-slate-300 font-normal' : 'text-slate-100 font-medium'"
        >
          {{ title }}
        </p>
        <p class="text-xs text-slate-400 truncate">
          {{ description }}
        </p>
      </div>
      <UIcon
        name="i-lucide-chevron-down"
        class="w-4 h-4 text-slate-500 transition-transform"
        :class="{ 'rotate-180': expanded }"
      />
    </button>

    <!-- Expanded Details -->
    <div
      v-if="expanded && item.details?.length"
      class="px-4 pb-3 pt-1 border-t border-slate-700/30"
    >
      <div class="space-y-2">
        <div
          v-for="(detail, idx) in item.details"
          :key="idx"
          class="flex items-center gap-2 text-xs"
        >
          <UIcon
            v-if="detail.icon"
            :name="detail.icon"
            class="w-3 h-3 text-slate-500"
          />
          <span class="text-slate-400">{{ t(detail.labelKey) }}:</span>
          <span class="text-slate-200">{{ translateValue(detail.value, detail.valueParams) }}</span>
        </div>
      </div>

      <!-- Navigate Button -->
      <div
        v-if="item.relatedEntityId && item.relatedEntityType"
        class="mt-3 pt-2 border-t border-slate-700/30"
      >
        <UButton
          size="xs"
          color="info"
          variant="ghost"
          icon="i-lucide-external-link"
          @click="emit('navigate-to', item.relatedEntityType, item.relatedEntityId)"
        >
          {{ t('game.event-log.go-to', { entity: t(`game.event-log.entity-types.${item.relatedEntityType}`) }) }}
        </UButton>
      </div>
    </div>
  </div>
</template>

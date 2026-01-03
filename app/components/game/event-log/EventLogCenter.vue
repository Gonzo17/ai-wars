<script setup lang="ts">
import type { GameEvent, GameEventFilter } from '~~/shared/types/events'

const props = defineProps<{
  events: GameEvent[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'mark-read', id: string): void
  (e: 'navigate-to', entityType: string, entityId: string): void
}>()

const { t } = useI18n()

const activeFilter = ref<GameEventFilter>('all')
const showOnlyUnread = ref(false)
const expandedEvents = ref<Set<string>>(new Set())

// Calculate unread counts per filter
const unreadCounts = computed(() => {
  const counts: Record<string, number> = { all: 0 }
  for (const event of props.events) {
    if (!event.read) {
      counts.all!++
      counts[event.type] = (counts[event.type] ?? 0) + 1
    }
  }
  return counts
})

const filterOptions = computed(() => [
  { key: 'all' as const, label: t('game.event-log.filters.all'), icon: 'i-lucide-list' },
  { key: 'combat' as const, label: t('game.event-log.filters.combat'), icon: 'i-lucide-swords' },
  { key: 'research-complete' as const, label: t('game.event-log.filters.research'), icon: 'i-lucide-flask-conical' },
  { key: 'building-complete' as const, label: t('game.event-log.filters.buildings'), icon: 'i-lucide-building' },
  { key: 'ship-complete' as const, label: t('game.event-log.filters.ships'), icon: 'i-lucide-rocket' },
  { key: 'army-arrived' as const, label: t('game.event-log.filters.fleets'), icon: 'i-lucide-navigation' },
  { key: 'discovery' as const, label: t('game.event-log.filters.discovery'), icon: 'i-lucide-compass' }
])

const filteredEvents = computed(() => {
  let result = props.events

  // Filter by type
  if (activeFilter.value !== 'all') {
    result = result.filter(e => e.type === activeFilter.value)
  }

  // Filter by unread
  if (showOnlyUnread.value) {
    result = result.filter(e => !e.read)
  }

  return result
})

const eventsByYear = computed(() => {
  const grouped = new Map<number, GameEvent[]>()
  for (const event of filteredEvents.value) {
    const yearEvents = grouped.get(event.year) ?? []
    yearEvents.push(event)
    grouped.set(event.year, yearEvents)
  }
  return Array.from(grouped.entries()).sort((a, b) => b[0] - a[0])
})

const toggleExpanded = (eventId: string) => {
  if (expandedEvents.value.has(eventId)) {
    expandedEvents.value.delete(eventId)
  } else {
    expandedEvents.value.add(eventId)
    // Mark as read when expanding
    emit('mark-read', eventId)
  }
}

const isExpanded = (eventId: string) => expandedEvents.value.has(eventId)

const getUnreadCount = (filterKey: GameEventFilter): number => {
  return unreadCounts.value[filterKey] ?? 0
}
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center p-8 overflow-hidden">
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      @click="emit('close')"
    />

    <!-- Panel -->
    <div class="relative w-full max-w-2xl max-h-[calc(100%-4rem)] flex flex-col rounded-lg border border-cyan-500/30 bg-slate-900/95 shadow-lg shadow-cyan-500/10 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
        <div class="flex items-center gap-3">
          <UIcon
            name="i-lucide-scroll-text"
            class="w-5 h-5 text-cyan-400"
          />
          <h2 class="text-lg font-semibold text-slate-100">
            {{ $t('game.event-log.title') }}
          </h2>
        </div>
        <div class="flex items-center gap-2">
          <!-- Unread Only Toggle -->
          <UButton
            :icon="showOnlyUnread ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            :color="showOnlyUnread ? 'info' : 'neutral'"
            :variant="showOnlyUnread ? 'soft' : 'ghost'"
            size="sm"
            @click="showOnlyUnread = !showOnlyUnread"
          >
            {{ $t('game.event-log.filters.unread') }}
          </UButton>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="emit('close')"
          />
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="flex items-center gap-2 px-5 py-3 border-b border-slate-700/50 overflow-x-auto">
        <div
          v-for="filter in filterOptions"
          :key="filter.key"
          class="relative"
        >
          <UButton
            :icon="filter.icon"
            :color="activeFilter === filter.key ? 'info' : 'neutral'"
            :variant="activeFilter === filter.key ? 'soft' : 'ghost'"
            size="xs"
            @click="activeFilter = filter.key"
          >
            {{ filter.label }}
          </UButton>
          <!-- Unread Badge -->
          <span
            v-if="getUnreadCount(filter.key) > 0"
            class="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-slate-950 bg-cyan-400 rounded-full"
          >
            {{ getUnreadCount(filter.key) }}
          </span>
        </div>
      </div>

      <!-- Events List -->
      <div class="flex-1 overflow-y-auto p-5 space-y-6">
        <template v-if="eventsByYear.length > 0">
          <div
            v-for="[year, yearEvents] in eventsByYear"
            :key="year"
            class="space-y-3"
          >
            <!-- Year Header -->
            <div class="flex items-center gap-2 text-sm text-slate-400">
              <span class="font-mono">{{ year }}</span>
              <div class="flex-1 h-px bg-slate-700/50" />
            </div>

            <!-- Events -->
            <div class="space-y-2">
              <GameEventLogItem
                v-for="event in yearEvents"
                :key="event.id"
                :item="event"
                :expanded="isExpanded(event.id)"
                @toggle="toggleExpanded(event.id)"
                @navigate-to="(type, id) => emit('navigate-to', type, id)"
              />
            </div>
          </div>
        </template>

        <!-- Empty State -->
        <div
          v-else
          class="flex flex-col items-center justify-center py-12 text-slate-500"
        >
          <UIcon
            name="i-lucide-inbox"
            class="w-10 h-10 mb-3"
          />
          <p class="text-sm">
            {{ $t('game.event-log.empty') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

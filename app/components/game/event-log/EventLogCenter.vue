<script setup lang="ts">
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'navigate-to', entityType: string, entityId: string): void
}>()

const { t } = useI18n()
const store = useEventLogStore()

const expandedEvents = ref<Set<string>>(new Set())

const filterOptions = computed(() => [
  { key: 'all' as const, label: t('game.event-log.filters.all'), icon: 'i-lucide-list' },
  { key: 'combat' as const, label: t('game.event-log.filters.combat'), icon: eventTypeIcons.combat },
  { key: 'research-complete' as const, label: t('game.event-log.filters.research'), icon: eventTypeIcons['research-complete'] },
  { key: 'building-complete' as const, label: t('game.event-log.filters.buildings'), icon: eventTypeIcons['building-complete'] },
  { key: 'ship-complete' as const, label: t('game.event-log.filters.ships'), icon: eventTypeIcons['ship-complete'] },
  { key: 'army-arrived' as const, label: t('game.event-log.filters.movements'), icon: eventTypeIcons['army-arrived'] },
  { key: 'colony-established' as const, label: t('game.event-log.filters.colony'), icon: eventTypeIcons['colony-established'] },
  { key: 'discovery' as const, label: t('game.event-log.filters.discovery'), icon: eventTypeIcons.discovery }
])

const toggleExpanded = (eventId: string) => {
  if (expandedEvents.value.has(eventId)) {
    expandedEvents.value.delete(eventId)
  } else {
    expandedEvents.value.add(eventId)
    // Mark as read when expanding
    store.markAsRead(eventId)
  }
}

const isExpanded = (eventId: string) => expandedEvents.value.has(eventId)

const getUnreadCount = (filterKey: GameEventFilter): number => {
  return store.unreadCountByType[filterKey] ?? 0
}
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center p-8 overflow-hidden">
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
      @click="emit('close')"
    />

    <!-- Panel -->
    <div class="relative w-full max-w-3xl h-[calc(100vh-16rem)] flex flex-col rounded-lg border border-info-500/30 bg-neutral-900/95 shadow-lg shadow-info-500/10 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-700/50">
        <div class="flex items-center gap-3">
          <UIcon
            name="i-lucide-scroll-text"
            class="w-5 h-5 text-info-400"
          />
          <h2 class="text-lg font-semibold text-neutral-100">
            {{ $t('game.event-log.title') }}
          </h2>
        </div>
        <div class="flex items-center gap-2">
          <!-- Unread Only Toggle -->
          <UButton
            :icon="store.showOnlyUnread ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            :color="store.showOnlyUnread ? 'info' : 'neutral'"
            :variant="store.showOnlyUnread ? 'soft' : 'ghost'"
            size="sm"
            @click="store.toggleUnreadOnly"
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
      <div class="flex items-center gap-2 px-5 py-3 border-b border-neutral-700/50 overflow-x-auto overflow-y-hidden">
        <div
          v-for="filter in filterOptions"
          :key="filter.key"
          class="relative"
        >
          <UButton
            :icon="filter.icon"
            :color="store.activeFilter === filter.key ? 'info' : 'neutral'"
            :variant="store.activeFilter === filter.key ? 'soft' : 'ghost'"
            size="xs"
            @click="store.setFilter(filter.key)"
          >
            {{ filter.label }}
          </UButton>
          <!-- Unread Badge -->
          <span
            v-if="getUnreadCount(filter.key) > 0"
            class="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-neutral-950 bg-info-400 rounded-full"
          >
            {{ getUnreadCount(filter.key) }}
          </span>
        </div>
      </div>

      <!-- Events List -->
      <div class="flex-1 overflow-y-auto p-5 space-y-6">
        <template v-if="store.eventsByYear.length > 0">
          <div
            v-for="[year, yearEvents] in store.eventsByYear"
            :key="year"
            class="space-y-3"
          >
            <!-- Year Header -->
            <div class="flex items-center gap-2 text-sm text-neutral-400">
              <span class="font-mono">{{ year }}</span>
              <div class="flex-1 h-px bg-neutral-700/50" />
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
          class="flex flex-col items-center justify-center py-12 text-neutral-500"
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

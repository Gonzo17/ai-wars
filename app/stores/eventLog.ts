import type { GameEvent, GameEventFilter } from '~~/shared/types/events'

export const useEventLogStore = defineStore('eventLog', () => {
  // State
  const events = ref<GameEvent[]>([])
  const isOpen = ref(false)
  const activeFilter = ref<GameEventFilter>('all')
  const showOnlyUnread = ref(false)

  // Getters
  const unreadCount = computed(() => events.value.filter(e => !e.read).length)

  const unreadCountByType = computed(() => {
    const counts: Record<string, number> = { all: 0 }
    for (const event of events.value) {
      if (!event.read) {
        counts.all!++
        counts[event.type] = (counts[event.type] ?? 0) + 1
      }
    }
    return counts
  })

  const filteredEvents = computed(() => {
    let result = events.value

    if (activeFilter.value !== 'all') {
      result = result.filter(e => e.type === activeFilter.value)
    }

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

  // Actions
  const addEvent = (event: Omit<GameEvent, 'id' | 'timestamp' | 'read'>) => {
    const newEvent: GameEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      read: false
    }
    events.value.unshift(newEvent)
    return newEvent
  }

  const markAsRead = (id: string) => {
    const event = events.value.find(e => e.id === id)
    if (event) {
      event.read = true
    }
  }

  const markAllAsRead = () => {
    for (const event of events.value) {
      event.read = true
    }
  }

  const clearEvents = () => {
    events.value = []
  }

  const open = () => {
    isOpen.value = true
  }

  const close = () => {
    isOpen.value = false
  }

  const toggle = () => {
    isOpen.value = !isOpen.value
  }

  const setFilter = (filter: GameEventFilter) => {
    activeFilter.value = filter
  }

  const toggleUnreadOnly = () => {
    showOnlyUnread.value = !showOnlyUnread.value
  }

  // Initialize with mock data (for development)
  const initMockData = (currentYear: number) => {
    const mockEvents: Omit<GameEvent, 'id' | 'timestamp'>[] = [
      {
        type: 'research-complete',
        severity: 'success',
        year: currentYear,
        titleKey: 'events.types.research-complete.title',
        titleParams: { name: 'Quantum Lattice' },
        descriptionKey: 'events.types.research-complete.description',
        descriptionParams: { location: 'Aurora Prime' },
        details: [
          { labelKey: 'events.details.research-time', value: '2', valueParams: { count: 2 }, icon: 'i-lucide-clock' },
          { labelKey: 'events.details.unlocks', value: 'Quantum Shield Generator', icon: 'i-lucide-unlock' }
        ],
        relatedEntityId: 'p-aurora',
        relatedEntityType: 'planet',
        read: false,
        showToast: true
      },
      {
        type: 'building-complete',
        severity: 'success',
        year: currentYear,
        titleKey: 'events.types.building-complete.title',
        titleParams: { name: 'Hab Complex' },
        descriptionKey: 'events.types.building-complete.description',
        descriptionParams: { location: 'Aurora Prime' },
        details: [
          { labelKey: 'events.details.materials-used', value: '150', icon: 'i-lucide-wrench' },
          { labelKey: 'events.details.energy-used', value: '80', icon: 'i-lucide-zap' },
          { labelKey: 'events.details.population-bonus', value: '+500', icon: 'i-lucide-users' }
        ],
        relatedEntityId: 'p-aurora',
        relatedEntityType: 'planet',
        read: false,
        showToast: true
      },
      {
        type: 'army-arrived',
        severity: 'info',
        year: currentYear - 1,
        titleKey: 'events.types.army-arrived.title',
        titleParams: { name: 'Spearhead' },
        descriptionKey: 'events.types.army-arrived.description',
        descriptionParams: { location: 'Nadir Gate' },
        details: [
          { labelKey: 'events.details.fleet-strength', value: '74', icon: 'i-lucide-shield' },
          { labelKey: 'events.details.travel-time', value: '2', valueParams: { count: 2 }, icon: 'i-lucide-clock' }
        ],
        relatedEntityId: 'a2',
        relatedEntityType: 'army',
        read: true
      },
      {
        type: 'combat',
        severity: 'warning',
        year: currentYear - 1,
        titleKey: 'events.types.combat.title',
        titleParams: { location: 'Helios Fringe' },
        descriptionKey: 'events.types.combat.description',
        descriptionParams: { outcome: 'events.values.victory' },
        details: [
          { labelKey: 'events.details.enemy-losses', value: '12', valueParams: { count: 12 }, icon: 'i-lucide-skull' },
          { labelKey: 'events.details.our-losses', value: '3', valueParams: { count: 3 }, icon: 'i-lucide-heart-crack' },
          { labelKey: 'events.details.outcome', value: 'events.values.victory', icon: 'i-lucide-trophy' }
        ],
        relatedEntityId: 's-helix',
        relatedEntityType: 'system',
        read: true
      },
      {
        type: 'discovery',
        severity: 'info',
        year: currentYear - 2,
        titleKey: 'events.types.discovery.title',
        titleParams: {},
        descriptionKey: 'events.types.discovery.description',
        descriptionParams: { name: 'Aster Drift' },
        details: [
          { labelKey: 'events.details.system-name', value: 'Aster Drift', icon: 'i-lucide-star' },
          { labelKey: 'events.details.intel-level', value: 'Low', icon: 'i-lucide-eye' }
        ],
        read: true
      }
    ]

    // Add mock events with proper IDs and timestamps
    mockEvents.forEach((event, i) => {
      events.value.push({
        ...event,
        id: `evt-mock-${i}`,
        timestamp: Date.now() - (i * 100000)
      } as GameEvent)
    })
  }

  return {
    // State
    events,
    isOpen,
    activeFilter,
    showOnlyUnread,
    // Getters
    unreadCount,
    unreadCountByType,
    filteredEvents,
    eventsByYear,
    // Actions
    addEvent,
    markAsRead,
    markAllAsRead,
    clearEvents,
    open,
    close,
    toggle,
    setFilter,
    toggleUnreadOnly,
    initMockData
  }
})

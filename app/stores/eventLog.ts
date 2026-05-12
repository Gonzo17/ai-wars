export const useEventLogStore = defineStore('eventLog', () => {
  // State
  const events = ref<GameEvent[]>([])
  const isOpen = ref(false)
  const activeFilter = ref<GameEventFilter>('all')
  const showOnlyUnread = ref(false)

  const highlightedEventId = ref<string | null>(null)

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

  // Opens event log with correct filter and highlights the event
  const openToEvent = (eventId: string) => {
    const event = events.value.find(e => e.id === eventId)
    if (event) {
      // Set filter to show this event type
      activeFilter.value = event.type
      showOnlyUnread.value = false

      // Open the event log
      isOpen.value = true

      // Highlight the event (will blink 3 times)
      highlightedEventId.value = eventId

      // Clear highlight after animation
      setTimeout(() => {
        highlightedEventId.value = null
      }, 1500) // 3 blinks at 500ms each
    }
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

  const setEventsFromSnapshot = (nextEvents: GameEvent[]) => {
    const existing = new Map(events.value.map(event => [event.id, event]))
    events.value = (nextEvents ?? [])
      .map(event => ({
        ...event,
        read: existing.get(event.id)?.read ?? event.read ?? false
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
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

  return {
    // State
    events,
    isOpen,
    activeFilter,
    showOnlyUnread,
    highlightedEventId,
    // Getters
    unreadCount,
    unreadCountByType,
    filteredEvents,
    eventsByYear,
    // Actions
    addEvent,
    markAsRead,
    markAllAsRead,
    setEventsFromSnapshot,
    clearEvents,
    open,
    close,
    toggle,
    setFilter,
    toggleUnreadOnly,
    openToEvent
  }
})

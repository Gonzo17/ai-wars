import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const createMockEvent = (overrides: Partial<{
  type: GameEventType
  severity: GameEventSeverity
  year: number
}> = {}) => ({
  type: 'research-complete' as GameEventType,
  severity: 'success' as GameEventSeverity,
  year: 2245,
  titleKey: 'events.types.research-complete.title',
  titleParams: { name: 'Test Research' },
  descriptionKey: 'events.types.research-complete.description',
  descriptionParams: { location: 'Test Location' },
  ...overrides
})

describe('eventLog Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  describe('addEvent', () => {
    it('creates event with unique ID and timestamp', () => {
      const store = useEventLogStore()
      const event = store.addEvent(createMockEvent())

      expect(event.id).toBeDefined()
      expect(event.id).toMatch(/^evt-/)
      expect(event.timestamp).toBeDefined()
      expect(typeof event.timestamp).toBe('number')
    })

    it('adds event to the beginning of events array', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent({ type: 'research-complete' }))
      store.addEvent(createMockEvent({ type: 'combat' }))

      expect(store.events).toHaveLength(2)
      expect(store.events[0].type).toBe('combat')
      expect(store.events[1].type).toBe('research-complete')
    })

    it('sets read to false by default', () => {
      const store = useEventLogStore()
      const event = store.addEvent(createMockEvent())

      expect(event.read).toBe(false)
    })
  })

  describe('filtering', () => {
    it('filters events by type', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent({ type: 'research-complete' }))
      store.addEvent(createMockEvent({ type: 'combat' }))
      store.addEvent(createMockEvent({ type: 'research-complete' }))

      store.setFilter('research-complete')

      expect(store.filteredEvents).toHaveLength(2)
      // @ts-expect-error type any for test
      expect(store.filteredEvents.every(e => e.type === 'research-complete')).toBe(true)
    })

    it('shows all events when filter is "all"', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent({ type: 'research-complete' }))
      store.addEvent(createMockEvent({ type: 'combat' }))

      store.setFilter('all')

      expect(store.filteredEvents).toHaveLength(2)
    })

    it('filters unread events only', () => {
      const store = useEventLogStore()

      const event1 = store.addEvent(createMockEvent())
      store.addEvent(createMockEvent())
      store.markAsRead(event1.id)

      store.toggleUnreadOnly()

      expect(store.filteredEvents).toHaveLength(1)
      expect(store.filteredEvents[0].read).toBe(false)
    })
  })

  describe('read status', () => {
    it('marks single event as read', () => {
      const store = useEventLogStore()
      const event = store.addEvent(createMockEvent())

      expect(event.read).toBe(false)

      store.markAsRead(event.id)

      expect(store.events[0].read).toBe(true)
    })

    it('marks all events as read', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent())
      store.addEvent(createMockEvent())
      store.addEvent(createMockEvent())

      store.markAllAsRead()
      // @ts-expect-error type any for test
      expect(store.events.every(e => e.read)).toBe(true)
    })
  })

  describe('unread count', () => {
    it('calculates total unread count correctly', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent())
      store.addEvent(createMockEvent())
      const event3 = store.addEvent(createMockEvent())

      expect(store.unreadCount).toBe(3)

      store.markAsRead(event3.id)

      expect(store.unreadCount).toBe(2)
    })

    it('calculates unread count by type correctly', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent({ type: 'research-complete' }))
      store.addEvent(createMockEvent({ type: 'combat' }))
      store.addEvent(createMockEvent({ type: 'research-complete' }))

      expect(store.unreadCountByType['research-complete']).toBe(2)
      expect(store.unreadCountByType['combat']).toBe(1)
      expect(store.unreadCountByType['all']).toBe(3)
    })
  })

  describe('openToEvent', () => {
    it('opens event log and sets correct filter', () => {
      const store = useEventLogStore()
      const event = store.addEvent(createMockEvent({ type: 'combat' }))

      store.openToEvent(event.id)

      expect(store.isOpen).toBe(true)
      expect(store.activeFilter).toBe('combat')
    })

    it('sets highlighted event ID', () => {
      const store = useEventLogStore()
      const event = store.addEvent(createMockEvent())

      store.openToEvent(event.id)

      expect(store.highlightedEventId).toBe(event.id)
    })

    it('clears highlight after timeout', () => {
      const store = useEventLogStore()
      const event = store.addEvent(createMockEvent())

      store.openToEvent(event.id)
      expect(store.highlightedEventId).toBe(event.id)

      vi.advanceTimersByTime(1500)

      expect(store.highlightedEventId).toBe(null)
    })

    it('resets unread filter when opening to event', () => {
      const store = useEventLogStore()
      store.toggleUnreadOnly()
      const event = store.addEvent(createMockEvent())

      store.openToEvent(event.id)

      expect(store.showOnlyUnread).toBe(false)
    })
  })

  describe('event log open/close', () => {
    it('opens event log', () => {
      const store = useEventLogStore()

      store.open()

      expect(store.isOpen).toBe(true)
    })

    it('closes event log', () => {
      const store = useEventLogStore()
      store.open()

      store.close()

      expect(store.isOpen).toBe(false)
    })

    it('toggles event log', () => {
      const store = useEventLogStore()

      store.toggle()
      expect(store.isOpen).toBe(true)

      store.toggle()
      expect(store.isOpen).toBe(false)
    })
  })

  describe('eventsByYear', () => {
    it('groups events by year in descending order', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent({ year: 2243 }))
      store.addEvent(createMockEvent({ year: 2245 }))
      store.addEvent(createMockEvent({ year: 2244 }))
      store.addEvent(createMockEvent({ year: 2245 }))

      const grouped = store.eventsByYear

      expect(grouped).toHaveLength(3)
      expect(grouped[0][0]).toBe(2245)
      expect(grouped[0][1]).toHaveLength(2)
      expect(grouped[1][0]).toBe(2244)
      expect(grouped[2][0]).toBe(2243)
    })
  })

  describe('clearEvents', () => {
    it('removes all events', () => {
      const store = useEventLogStore()

      store.addEvent(createMockEvent())
      store.addEvent(createMockEvent())

      store.clearEvents()

      expect(store.events).toHaveLength(0)
    })
  })
})

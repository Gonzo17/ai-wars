<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <GameTopBar
      :year="year"
      :unread-event-count="unreadEventCount"
      @end-year="handleEndYear"
      @toggle-event-log="eventLogOpen = !eventLogOpen"
    />

    <div class="h-full flex gap-4 px-6 pb-8 pt-4">
      <div class="w-150 shrink-0 flex flex-col gap-4">
        <GameGlobalPanel
          :resources="resources"
          :research="research"
          :armies="armies"
          :planets="planets"
          :systems="systems"
          @select-army="(id: string) => setSelection('army', id)"
          @open-research="setSelection('research')"
          @end-year="handleEndYear"
          @select-planet="(id: string) => setSelection('planet', id)"
        />

        <GameSelectionPanel
          :selection-type="selectedType"
          :selection="selection"
          @update:view-mode="handleViewModeChange"
        />
      </div>

      <div class="relative flex-1">
        <GameCanvas
          :view-mode="viewMode"
          :selected-type="selectedType"
          :selected-id="selectedId!"
          :planets="planets"
          :systems="systems"
          @select-planet="(id: string) => setSelection('planet', id)"
          @select-system="(id: string) => setSelection('system', id)"
          @update:view-mode="handleViewModeChange"
        />

        <!-- Event Log Overlay -->
        <GameEventLogCenter
          v-if="eventLogOpen"
          :events="events"
          @close="eventLogOpen = false"
          @mark-read="markEventRead"
          @navigate-to="handleEventNavigate"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
type SelectionType = 'planet' | 'army' | 'system' | 'research'

definePageMeta({
  title: 'AI Wars',
  layout: false
})

const year = ref(2245)
const viewMode = ref<'galaxy' | 'system'>('galaxy')
const selectedType = ref<SelectionType>('planet')
const selectedId = ref<string | undefined>('p-aurora')
const eventLogOpen = ref(false)

const toast = useToast()

// Mock Events
const events = ref<GameEvent[]>([
  {
    id: 'evt-1',
    type: 'research-complete',
    severity: 'success',
    year: 2245,
    title: 'Quantum Lattice Research Complete',
    description: 'New technology unlocked at Aurora Prime',
    details: [
      { label: 'Research Time', value: '2 years', icon: 'i-lucide-clock' },
      { label: 'Unlocks', value: 'Quantum Shield Generator', icon: 'i-lucide-unlock' }
    ],
    relatedEntityId: 'p-aurora',
    relatedEntityType: 'planet',
    read: false,
    timestamp: Date.now()
  },
  {
    id: 'evt-2',
    type: 'building-complete',
    severity: 'success',
    year: 2245,
    title: 'Hab Complex Completed',
    description: 'New building operational on Aurora Prime',
    details: [
      { label: 'Materials Used', value: '150', icon: 'i-lucide-wrench' },
      { label: 'Energy Used', value: '80', icon: 'i-lucide-zap' },
      { label: 'Population Bonus', value: '+500', icon: 'i-lucide-users' }
    ],
    relatedEntityId: 'p-aurora',
    relatedEntityType: 'planet',
    read: false,
    timestamp: Date.now() - 1000
  },
  {
    id: 'evt-3',
    type: 'army-arrived',
    severity: 'info',
    year: 2244,
    title: 'Spearhead Fleet Arrived',
    description: 'Fleet arrived at Nadir Gate',
    details: [
      { label: 'Fleet Strength', value: '74', icon: 'i-lucide-shield' },
      { label: 'Travel Time', value: '2 years', icon: 'i-lucide-clock' }
    ],
    relatedEntityId: 'a2',
    relatedEntityType: 'army',
    read: true,
    timestamp: Date.now() - 100000
  },
  {
    id: 'evt-4',
    type: 'combat',
    severity: 'warning',
    year: 2244,
    title: 'Skirmish at Helios Fringe',
    description: 'Enemy forces engaged near the border',
    details: [
      { label: 'Enemy Losses', value: '12 units', icon: 'i-lucide-skull' },
      { label: 'Our Losses', value: '3 units', icon: 'i-lucide-heart-crack' },
      { label: 'Outcome', value: 'Victory', icon: 'i-lucide-trophy' }
    ],
    relatedEntityId: 's-helix',
    relatedEntityType: 'system',
    read: true,
    timestamp: Date.now() - 200000
  },
  {
    id: 'evt-5',
    type: 'discovery',
    severity: 'info',
    year: 2243,
    title: 'New System Discovered',
    description: 'Probe detected unknown system beyond Helios Fringe',
    details: [
      { label: 'System Name', value: 'Aster Drift', icon: 'i-lucide-star' },
      { label: 'Intel Level', value: 'Low', icon: 'i-lucide-eye' }
    ],
    read: true,
    timestamp: Date.now() - 300000
  }
])

const unreadEventCount = computed(() => events.value.filter(e => !e.read).length)

const markEventRead = (id: string) => {
  const event = events.value.find(e => e.id === id)
  if (event) event.read = true
}

const handleEventNavigate = (entityType: string, entityId: string) => {
  setSelection(entityType as SelectionType, entityId)
  eventLogOpen.value = false
}

const { t } = useI18n()

const resources = computed((): GameResource[] => [
  { key: 'energy', label: t('game.resources.energy'), amount: 1260, delta: '+15', accent: 'text-warning-300', icon: 'zap' },
  { key: 'material', label: t('game.resources.material'), amount: 880, delta: '+7', accent: 'text-stone-300', icon: 'wrench' },
  { key: 'rare', label: t('game.resources.rare'), amount: 210, delta: '+1', accent: 'text-pink-300', icon: 'gem' }
])

const research = ref({ id: 'quantum-lattice', yearsLeft: 2 })

const armies = ref<GameArmy[]>([
  { id: 'a1', name: 'Horizon Wing', status: 'idle', location: 'Aurora Prime', strength: 82 },
  { id: 'a2', name: 'Spearhead', status: 'en-route', location: 'to Nadir Gate', eta: '2y', strength: 74 },
  { id: 'a3', name: 'Vanguard', status: 'idle', location: 'Borealis Shipyard', strength: 65 }
])

const systems = ref<GameSolarSystem[]>([
  { id: 's-lyra', name: 'Lyra-7', probeStatus: 'scanned', intel: 'high', connections: ['Nadir Gate', 'Helios Fringe'], location: { x: 22, y: 35 } },
  { id: 's-nadir', name: 'Nadir Gate', probeStatus: 'charted', intel: 'medium', connections: ['Lyra-7', 'Aster Drift'], location: { x: 58, y: 48 } },
  { id: 's-helix', name: 'Helios Fringe', probeStatus: 'ping-only', intel: 'low', connections: ['Lyra-7'], location: { x: 42, y: 68 } }
])

const planets = ref<GamePlanet[]>([
  {
    id: 'p-aurora',
    systemId: 's-lyra',
    name: 'Aurora Prime',
    owner: 'Terran Union',
    type: 'Terran Core',
    buildings: ['Fusion Core', 'Orbital Dock', 'Hydroponics'],
    queues: { build: ['Hab Complex (2y)'], shipyard: ['Frigate Hull (3y)'] },
    location: { x: 28, y: 44 }
  },
  {
    id: 'p-borealis',
    systemId: 's-lyra',
    name: 'Borealis',
    owner: 'Terran Union',
    type: 'Ice World',
    buildings: ['Refinery Node', 'Listening Post'],
    queues: { build: ['Refinery Upgrade (1y)'], shipyard: [] },
    location: { x: 52, y: 62 }
  },
  {
    id: 'p-nadir-outpost',
    systemId: 's-nadir',
    name: 'Nadir Outpost',
    owner: 'Unclaimed',
    type: 'Rocky',
    buildings: ['Landing Pad'],
    queues: { build: [], shipyard: [] },
    location: { x: 74, y: 38 }
  }
])

const selection = computed(() => {
  if (selectedType.value === 'planet') {
    return planets.value.find(p => p.id === selectedId.value) ?? null
  }
  if (selectedType.value === 'army') {
    return armies.value.find(a => a.id === selectedId.value) ?? null
  }
  if (selectedType.value === 'system') {
    return systems.value.find(s => s.id === selectedId.value) ?? null
  }
  return null
})

const setSelection = (type: SelectionType, id?: string) => {
  selectedType.value = type
  selectedId.value = id
}

const handleViewModeChange = (mode: 'galaxy' | 'system') => {
  viewMode.value = mode
}

const handleEndYear = () => {
  year.value += 1
  toast.add({ title: t('game.toast.year-advanced-title', { value: year.value }), description: t('game.toast.year-advanced-description'), color: 'neutral' })
}
</script>

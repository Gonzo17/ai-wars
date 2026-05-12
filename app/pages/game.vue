<template>
  <div class="h-screen bg-neutral-950">
    <!-- Loading Screen -->
    <CommonLoadingScreen @retry="retryLoading" />

    <div
      v-if="!appLoading.isLoading.value"
      class="h-full text-neutral-100 flex flex-col overflow-hidden"
    >
      <GameTopBar
        :year="year"
        :animate-year="yearPulse"
        :unread-event-count="eventLogStore.unreadCount"
        :resources="resources"
        :research="research"
        :research-points-per-turn="researchPointsPerTurnDisplay"
        :players="readyPlayers"
        :planet-action-count="planetActionCount"
        @toggle-event-log="eventLogStore.toggle"
        @open-research="researchStore.toggle"
        @open-planet-overview="planetOverviewOpen = true"
      />

      <!-- Full-screen Map Container -->
      <div class="relative flex-1 overflow-hidden">
        <GameCanvas
          :view-mode="viewMode"
          :selected-type="selectedType"
          :selected-id="selectedId ?? ''"
          :galaxies="galaxiesWithCounts"
          :systems="systemsInGalaxy"
          :planets="planetsInSystem"
          @select-planet="handleSelectPlanet"
          @select-system="handleSelectSystem"
          @select-galaxy="handleSelectGalaxy"
          @update:view-mode="handleViewModeChange"
        />

        <GamePlanetPanel
          v-if="planetPanelOpen && selectedPlanetWithQueue"
          :planet="selectedPlanetWithQueue"
          :building-catalog="buildingCatalog"
          :unit-catalog="unitCatalog"
          :build-queue-limit="buildQueueLimit"
          :progress-memory="selectedPlanetProgressMemory"
          :show-back-to-overview="planetPanelFromOverview"
          :player-resources="playerResources"
          @close="planetPanelOpen = false"
          @back-to-overview="handleBackToOverview"
          @queue-build="handleQueueBuild"
          @cancel-build="handleCancelBuild"
        />

        <GamePlanetSlotView
          v-if="viewMode === 'planet' && selectedPlanetWithQueue"
          :planet="selectedPlanetWithQueue"
          :building-catalog="buildingCatalog"
          :unit-catalog="unitCatalog"
          :player-resources="playerResources"
          @close="handleExitPlanetView"
          @queue-build="handleQueueBuild"
        />

        <GamePlanetOverview
          v-if="planetOverviewOpen"
          :planets="planetsWithEffectiveQueue"
          :building-catalog="buildingCatalog"
          :unit-catalog="unitCatalog"
          :build-queue-limit="buildQueueLimit"
          :progress-memory="buildProgressMemory"
          @close="planetOverviewOpen = false"
          @open-planet="handleOpenPlanetFromOverview"
        />

        <!-- Event Log Overlay -->
        <GameEventLogCenter
          v-if="eventLogStore.isOpen"
          @close="eventLogStore.close"
          @navigate-to="handleEventNavigate"
        />

        <!-- Research Tree Overlay -->
        <GameResearchTreeGraph
          v-if="researchStore.isOpen"
          @close="researchStore.close"
          @start-research="handleStartResearch"
        />

        <!-- End Turn Button (hidden when dialogs are open) -->
        <GameEndTurnButton
          v-if="!eventLogStore.isOpen && !researchStore.isOpen && !planetPanelOpen && !planetOverviewOpen && viewMode !== 'planet'"
          :state="endTurnState"
          :players="readyPlayers"
          :disabled="submitting || !gameId"
          @submit="submitTurnPlan"
          @unsubmit="unsubmitTurnPlan"
          @open-production="planetOverviewOpen = true"
          @open-research="researchStore.toggle"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BUILDING_DEFS, BUILD_QUEUE_LIMIT, UNIT_DEFS, getBuildingDef, getUnitDef } from '~~/shared/defs/production'
import { TECH_DEFS } from '~~/shared/defs/research-tree'
import { validateTurnPlan } from '~~/shared/validation/turnPlan'
import { toPlayerId } from '~~/shared/utils/playerId'

type MapViewMode = 'universe' | 'galaxy' | 'system' | 'planet'
type SelectionType = 'planet' | 'army' | 'system' | 'galaxy' | 'research'
type PlanetSize = 'small' | 'medium' | 'large' | 'huge'

// Local UI types (different from backend types)
interface GameResource {
  key: string
  label: string
  amount: number
  delta: string
  accent: string
  icon: string
}

interface GamePlanet {
  id: string
  systemId: string
  systemName: string
  name: string
  owner: string
  ownerLabel: string
  type: string
  typeLabel: string
  size: PlanetSize
  sizeLabel: string
  workers: number
  productionPerWorker: number
  buildings: Array<{ id: string, level: number, isConstructing?: boolean }>
  slots: Array<{ buildingId: string | null, buildingLevel: number, isConstructing: boolean, constructionTimeLeft: number, zone: string, resourceNode: string | null }>
  buildQueue: Array<{ id: string, kind: 'building' | 'unit', productionSpent: number, resourcePaid: boolean, slotIndex?: number }>
  shipyardQueue: Array<{ id: string }>
  stationedUnits: Array<{ unitDefId: string, count: number }>
  location: { x: number, y: number }
}

interface BuildCosts {
  energy: number
  minerals: number
  rare: number
}

type BuildingCategory = 'energy' | 'minerals' | 'rare' | 'military' | 'research' | 'infrastructure'
type UnitCategory = 'support' | 'combat'

interface BuildingDefinition {
  id: string
  name: string
  description: string
  category: BuildingCategory
  maxLevel: number
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
}

interface UnitDefinition {
  id: string
  name: string
  role: string
  category: UnitCategory
  resourceCosts: BuildCosts
  productionCost: number
  icon: string
  requiresFacility: boolean
}

definePageMeta({
  layout: false
})

const startYear = 0
const year = computed(() => startYear + (gameTurn.value - 1))
const viewMode = ref<MapViewMode>('universe')
const selectedType = ref<SelectionType>('galaxy')
const selectedId = ref<string | undefined>(undefined)

const eventLogStore = useEventLogStore()
const researchStore = useResearchStore()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const authFetch = useAuthFetch()
const appLoading = useAppLoading()

const gameId = ref<string | null>(null)
const gameTurn = ref(1)
const gamePhase = ref<'planning' | 'resolving'>('planning')
const snapshot = ref<GameSnapshot | null>(null)
const currentUserId = ref<string | null>(null)
const submitting = ref(false)
const readyUserIds = ref<Set<string>>(new Set())
const gamePlayers = ref<Array<{ id: string, name: string }>>([])
const yearPulse = ref(false)
const turnAnimationActive = ref(false)
let turnAnimationTimer: ReturnType<typeof setTimeout> | null = null
let gameChannel: ReturnType<typeof supabase.channel> | null = null

const handleEventNavigate = (entityType: string, entityId: string) => {
  if (entityType === 'research') {
    researchStore.open()
    eventLogStore.close()
    return
  }

  if (entityType === 'planet') {
    const planet = planetsView.value.find(item => item.id === entityId)
    if (planet) {
      const system = systems.value.find(item => item.id === planet.systemId)
      if (system) {
        const galaxyId = systemGalaxyMap.value.get(system.id)
        if (galaxyId) {
          activeGalaxyId.value = galaxyId
        }
        activeSystemId.value = system.id
      }
      viewMode.value = 'system'
      setSelection('planet', entityId)
      eventLogStore.close()
      return
    }
  }

  if (entityType === 'system') {
    activeSystemId.value = entityId
    viewMode.value = 'system'
    setSelection('system', entityId)
    eventLogStore.close()
    return
  }

  if (entityType === 'galaxy') {
    activeGalaxyId.value = entityId
    viewMode.value = 'galaxy'
    setSelection('galaxy', entityId)
    eventLogStore.close()
    return
  }

  setSelection(entityType as SelectionType, entityId)
  eventLogStore.close()
}

const turnPlan = ref<TurnPlan>({ commands: [] })

const upsertBuildCommand = (planetId: string, kind: 'building' | 'unit', buildId: string, slotIndex?: number) => {
  const next: TurnCommand[] = turnPlan.value.commands.filter((command) => {
    if (command.type === 'buildStructure' || command.type === 'buildUnit') {
      return command.planetId !== planetId
    }
    return true
  })

  if (kind === 'building' && slotIndex !== undefined) {
    next.push({ type: 'buildStructure', planetId: planetId as PlanetId, buildingId: buildId as BuildingId, slotIndex })
  } else if (kind === 'unit') {
    next.push({ type: 'buildUnit', planetId: planetId as PlanetId, unitId: buildId as UnitId })
  }

  turnPlan.value = { commands: next }
}

const setResearchCommand = (researchId: string) => {
  const next: TurnCommand[] = turnPlan.value.commands.filter(command => command.type !== 'startResearch')
  next.push({ type: 'startResearch', researchId: researchId as ResearchId })
  turnPlan.value = { commands: next }
}

const planetOverviewOpen = ref(false)
const planetPanelFromOverview = ref(false)

const readyPlayers = computed(() => gamePlayers.value.map(player => ({
  id: player.id,
  name: player.name,
  ready: readyUserIds.value.has(player.id),
  isCurrentPlayer: player.id === currentUserId.value
})))

const endTurnState = computed(() => {
  if (!gameId.value) return 'action-required'
  if (gamePhase.value !== 'planning') return 'waiting'
  if (turnAnimationActive.value) return 'waiting'
  if (currentUserId.value && readyUserIds.value.has(currentUserId.value)) return 'waiting'
  if (planetActionCount.value > 0) return 'needs-production'
  if (!researchStore.activeResearch) return 'needs-research'
  return 'ready'
})

const notifyError = (message: string) => {
  console.error(message)
}

const fetchUserId = async () => {
  if (user.value?.id) return user.value.id
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

const resolveGameId = async () => {
  const routeGameId = typeof route.query.gameId === 'string' ? route.query.gameId : null
  if (routeGameId) return routeGameId
  const userId = await fetchUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('lobby_players')
    .select('lobby_id, lobbies: lobbies!inner(id, status, game_id)')
    .eq('user_id', userId)
    .limit(1)

  if (error) {
    notifyError(error.message)
    return null
  }

  const row = data?.[0] as { lobbies?: { game_id?: string | null, status?: string } | null } | undefined
  return row?.lobbies?.game_id ?? null
}

const loadGameCore = async () => {
  if (!gameId.value) return
  const { data, error } = await supabase
    .from('games')
    .select('id, turn, phase, status')
    .eq('id', gameId.value)
    .maybeSingle()

  if (error) {
    notifyError(error.message)
    return
  }

  if (data?.turn) gameTurn.value = data.turn
  if (data?.phase === 'planning' || data?.phase === 'resolving') {
    gamePhase.value = data.phase
  }
}

const loadPlayers = async () => {
  if (!gameId.value) return
  const { data, error } = await supabase
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId.value)

  if (error) {
    notifyError(error.message)
    return
  }

  const userIds = (data ?? []).map(row => row.user_id)
  if (userIds.length === 0) {
    gamePlayers.value = []
    return
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  if (profileError) {
    notifyError(profileError.message)
    return
  }

  const nameMap = Object.fromEntries((profiles ?? []).map(row => [row.id, row.username ?? row.id]))
  gamePlayers.value = userIds.map(id => ({ id, name: nameMap[id] ?? id }))
}

const loadSnapshot = async () => {
  if (!gameId.value) return
  const { snapshot: nextSnapshot } = await authFetch<{ snapshot: GameSnapshot, turn: number }>(
    `/api/games/${gameId.value}/state`,
    { query: { turn: gameTurn.value } }
  )

  snapshot.value = nextSnapshot ?? null
  if (snapshot.value && currentUserId.value) {
    const userId = currentUserId.value
    const playerId = toPlayerId(userId)
    const player = snapshot.value.players.find(p => p.userId === userId || p.id === playerId)
    if (player) {
      researchStore.hydrateFromSnapshot(player)
      eventLogStore.setEventsFromSnapshot(player.events ?? [])
      const points = getResearchPointsPerTurn(snapshot.value, player.id)
      researchStore.setResearchPointsPerTurn(points)
      const nextMemory = Object.fromEntries(
        snapshot.value.planets.map(planet => [planet.id, planet.progressMemory ?? {}])
      )
      const merged = Object.fromEntries(Object.entries(nextMemory).map(([planetId, memory]) => [
        planetId,
        {
          ...(memory as Record<string, { productionSpent: number, resourcePaid: boolean }>),
          ...(buildProgressMemory.value[planetId] ?? {})
        }
      ]))
      buildProgressMemory.value = merged
    } else {
      eventLogStore.setEventsFromSnapshot([])
    }
  }
}

const loadReadyState = async () => {
  if (!gameId.value) return
  const { data, error } = await supabase
    .from('game_players')
    .select('user_id, ready_turn, ready_at')
    .eq('game_id', gameId.value)

  if (error) {
    notifyError(error.message)
    return
  }

  readyUserIds.value = new Set((data ?? [])
    .filter(row => row.ready_turn === gameTurn.value && row.ready_at)
    .map(row => row.user_id))
}

const setupRealtime = () => {
  if (!gameId.value) return
  if (gameChannel) supabase.removeChannel(gameChannel)
  gameChannel = supabase
    .channel(`game:${gameId.value}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId.value}` }, (payload) => {
      const updated = payload.new as { turn?: number, phase?: 'planning' | 'resolving' }
      if (updated.turn) gameTurn.value = updated.turn
      if (updated.phase) gamePhase.value = updated.phase
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId.value}` }, () => {
      loadReadyState()
    })
    .subscribe()
}

const submitTurnPlan = async () => {
  if (!gameId.value) return
  eventLogStore.markAllAsRead()
  await loadGameCore()
  await loadSnapshot()
  await loadReadyState()
  if (snapshot.value?.turn && snapshot.value.turn !== gameTurn.value) {
    gameTurn.value = snapshot.value.turn
  }
  if (snapshot.value && currentUserId.value) {
    const errors = validateTurnPlan(snapshot.value, toPlayerId(currentUserId.value), turnPlan.value)
    if (errors.length > 0) {
      notifyError(errors[0]?.message ?? t('game.errors.submit-failed'))
      return
    }
  }
  submitting.value = true
  if (currentUserId.value) {
    readyUserIds.value = new Set([...readyUserIds.value, currentUserId.value])
  }
  try {
    const turnToSubmit = snapshot.value?.turn ?? gameTurn.value
    await authFetch(`/api/games/${gameId.value}/turn`, {
      method: 'POST',
      body: { turn: turnToSubmit, plan: turnPlan.value }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : t('game.errors.submit-failed')
    notifyError(message)
    if (currentUserId.value) {
      const next = new Set(readyUserIds.value)
      next.delete(currentUserId.value)
      readyUserIds.value = next
    }
  } finally {
    submitting.value = false
  }
}

const unsubmitTurnPlan = async () => {
  if (!gameId.value) return
  submitting.value = true
  if (currentUserId.value) {
    const next = new Set(readyUserIds.value)
    next.delete(currentUserId.value)
    readyUserIds.value = next
  }
  try {
    await authFetch(`/api/games/${gameId.value}/turn`, {
      method: 'DELETE',
      body: { turn: gameTurn.value }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : t('game.errors.unsubmit-failed')
    notifyError(message)
    if (currentUserId.value) {
      readyUserIds.value = new Set([...readyUserIds.value, currentUserId.value])
    }
  } finally {
    submitting.value = false
  }
}

const { t, te } = useI18n()
const gameTitle = computed(() => t('meta.game-title'))

useSeoMeta({
  title: gameTitle
})

const resourceMeta: Record<string, { labelKey: string, icon: string, accent: string }> = {
  'res:energy': { labelKey: 'game.resources.energy', icon: 'zap', accent: 'text-warning-300' },
  'res:material': { labelKey: 'game.resources.material', icon: 'pickaxe', accent: 'text-neutral-300' },
  'res:rare': { labelKey: 'game.resources.rare', icon: 'atom', accent: 'text-primary-300' }
}

// Calculate pending resource costs from turnPlan commands (optimistic updates)
const pendingResourceCosts = computed(() => {
  const costs = { energy: 0, minerals: 0, rare: 0 }
  if (!snapshot.value) return costs

  for (const command of turnPlan.value.commands) {
    if (command.type === 'buildStructure') {
      const planet = snapshot.value.planets.find(p => p.id === command.planetId)
      if (!planet) continue
      // Check if this slot already has this building under construction (resources already paid)
      const slot = planet.slots[command.slotIndex]
      const isResume = slot?.buildingId === command.buildingId && slot?.isConstructing
      if (!isResume) {
        const def = getBuildingDef(command.buildingId)
        if (def) {
          costs.energy += def.resourceCosts.energy
          costs.minerals += def.resourceCosts.minerals
          costs.rare += def.resourceCosts.rare
        }
      }
    } else if (command.type === 'buildUnit') {
      const planet = snapshot.value.planets.find(p => p.id === command.planetId)
      if (!planet) continue
      // Check if this build is already in the server queue (resources already paid)
      const alreadyInQueue = planet.queues.shipyard.some(u => u.id === command.unitId)
      const alreadyPaid = planet.progressMemory?.[command.unitId]?.resourcePaid
      if (!alreadyInQueue && !alreadyPaid) {
        const def = getUnitDef(command.unitId)
        if (def) {
          costs.energy += def.resourceCosts.energy
          costs.minerals += def.resourceCosts.minerals
          costs.rare += def.resourceCosts.rare
        }
      }
    }
  }

  return costs
})

const resources = computed((): GameResource[] => {
  if (!snapshot.value || !currentUserId.value) return []
  const playerId = toPlayerId(currentUserId.value)
  const player = snapshot.value.players.find(p => p.id === playerId || p.userId === currentUserId.value)
  const list = player?.resources ?? []
  const pending = pendingResourceCosts.value

  return list.map((resource) => {
    const meta = resourceMeta[resource.key] ?? { labelKey: resource.key, icon: 'circle', accent: 'text-neutral-300' }
    const delta = resource.delta ?? 0
    const deltaLabel = `${delta >= 0 ? '+' : ''}${delta}`

    // Subtract pending costs for this resource type
    let amount = resource.current
    if (resource.key === 'res:energy') amount -= pending.energy
    else if (resource.key === 'res:material') amount -= pending.minerals
    else if (resource.key === 'res:rare') amount -= pending.rare

    return {
      key: resource.key,
      label: te(meta.labelKey) ? t(meta.labelKey) : meta.labelKey,
      amount,
      delta: deltaLabel,
      accent: meta.accent,
      icon: meta.icon
    }
  })
})

const playerResources = computed(() => {
  if (!snapshot.value || !currentUserId.value) return { energy: 0, minerals: 0, rare: 0 }
  const playerId = toPlayerId(currentUserId.value)
  const player = snapshot.value.players.find(p => p.id === playerId || p.userId === currentUserId.value)
  const list = player?.resources ?? []
  const pending = pendingResourceCosts.value

  return {
    energy: (list.find(r => r.key === 'res:energy')?.current ?? 0) - pending.energy,
    minerals: (list.find(r => r.key === 'res:material')?.current ?? 0) - pending.minerals,
    rare: (list.find(r => r.key === 'res:rare')?.current ?? 0) - pending.rare
  }
})

const buildingNameKey = (id: string) => `game.buildings.${id.replace('bld:', '')}.name`
const buildingDescriptionKey = (id: string) => `game.buildings.${id.replace('bld:', '')}.description`
const unitNameKey = (id: string) => `game.units.${id.replace('unit:', '')}.name`
const unitRoleKey = (id: string) => `game.units.${id.replace('unit:', '')}.role`

const getResearchPointsPerTurn = (state: GameSnapshot, playerId: string) => {
  let total = 0
  for (const planet of state.planets) {
    if (planet.owner !== playerId) continue
    for (const slot of planet.slots) {
      if (!slot.buildingId || slot.isConstructing) continue
      const def = getBuildingDef(slot.buildingId)
      if (def?.researchPoints) {
        total += def.researchPoints * Math.max(1, slot.buildingLevel)
      }
    }
  }
  return total
}

const research = computed(() => {
  const active = researchStore.activeResearch
  if (!active) return undefined
  const tech = TECH_DEFS.find(t => t.id === active.techId)
  if (!tech) return undefined
  const required = tech.researchPoints ?? 0
  const pointsPerTurn = researchStore.researchPointsPerTurn
  const remaining = pointsPerTurn > 0
    ? Math.max(0, Math.ceil((required - active.progressPoints) / pointsPerTurn))
    : 0
  const progress = researchStore.getProgressPercent(active.techId)
  return { id: active.techId, roundsLeft: remaining, progress, pointsPerTurn }
})

const researchPointsPerTurnDisplay = computed(() => researchStore.researchPointsPerTurn)

const galaxies = computed(() => snapshot.value?.galaxies ?? [])
const systems = computed(() => snapshot.value?.systems ?? [])
const planets = computed(() => snapshot.value?.planets ?? [])

const playerNameById = computed(() => {
  const byUserId = new Map(gamePlayers.value.map(player => [player.id, player.name]))
  const map = new Map<string, string>()
  for (const player of snapshot.value?.players ?? []) {
    map.set(player.id, byUserId.get(player.userId) ?? player.userId)
  }
  return map
})

const systemNameById = computed(() => new Map(systems.value.map(system => [system.id, system.name])))

const getOwnerLabel = (owner: string) => {
  if (owner === 'unclaimed') return t('game.planet.owners.unclaimed')
  if (owner === 'unknown') return t('game.planet.owners.unknown')
  return playerNameById.value.get(owner) ?? owner
}

const getTypeLabel = (type: string) => {
  const key = `game.planet.types.${type}`
  return te(key) ? t(key) : type
}

const getSizeLabel = (size: PlanetSize) => {
  const key = `game.planet.sizes.${size}`
  return te(key) ? t(key) : size
}

const buildingCatalog = computed((): BuildingDefinition[] => BUILDING_DEFS.map(def => ({
  id: def.id,
  name: te(buildingNameKey(def.id)) ? t(buildingNameKey(def.id)) : def.id,
  description: te(buildingDescriptionKey(def.id)) ? t(buildingDescriptionKey(def.id)) : '',
  category: def.category,
  maxLevel: def.maxLevel ?? 1,
  resourceCosts: def.resourceCosts,
  productionCost: def.productionCost,
  icon: def.icon ?? 'i-lucide-hammer'
})))

const unitCatalog = computed((): UnitDefinition[] => UNIT_DEFS.map(def => ({
  id: def.id,
  name: te(unitNameKey(def.id)) ? t(unitNameKey(def.id)) : def.id,
  role: te(unitRoleKey(def.id)) ? t(unitRoleKey(def.id)) : '',
  category: def.category,
  resourceCosts: def.resourceCosts,
  productionCost: def.productionCost,
  icon: def.icon ?? 'i-lucide-rocket',
  requiresFacility: (def.requirements.buildings?.length ?? 0) > 0
})))

const getStationedUnits = (planet: Planet): Array<{ unitDefId: string, count: number }> => {
  const result: Array<{ unitDefId: string, count: number }> = []
  if (planet.workers > 0) {
    result.push({ unitDefId: 'unit:worker', count: planet.workers })
  }
  const fleets = snapshot.value?.fleets ?? []
  const counts = new Map<string, number>()
  for (const f of fleets) {
    if (f.location === planet.id) {
      counts.set(f.id, (counts.get(f.id) ?? 0) + 1)
    }
  }
  for (const [unitDefId, count] of counts.entries()) {
    result.push({ unitDefId, count })
  }
  return result
}

const planetsView = computed((): GamePlanet[] => {
  if (!planets.value.length) return []
  return planets.value.map(planet => ({
    id: planet.id,
    systemId: planet.systemId,
    systemName: systemNameById.value.get(planet.systemId) ?? planet.systemId,
    name: planet.name,
    owner: planet.owner,
    ownerLabel: getOwnerLabel(planet.owner),
    type: planet.type,
    typeLabel: getTypeLabel(planet.type),
    size: planet.size ?? 'medium',
    sizeLabel: getSizeLabel((planet.size ?? 'medium') as PlanetSize),
    workers: planet.workers,
    productionPerWorker: planet.productionPerWorker,
    buildings: planet.slots
      .filter(s => s.buildingId && !s.isConstructing)
      .map(s => ({ id: s.buildingId!, level: s.buildingLevel })),
    slots: planet.slots.map(s => ({
      buildingId: s.buildingId,
      buildingLevel: s.buildingLevel,
      isConstructing: s.isConstructing,
      constructionTimeLeft: s.constructionTimeLeft,
      zone: s.zone,
      resourceNode: s.resourceNode
    })),
    buildQueue: [
      ...planet.queues.build.map((entry) => {
        const slot = planet.slots[entry.slotIndex]
        if (!slot?.buildingId) return null
        const def = getBuildingDef(slot.buildingId)
        const productionCost = def?.productionCost ?? 0
        const remaining = slot.constructionTimeLeft
        const progress = productionCost > 0 ? (productionCost - remaining) / productionCost : 0
        return {
          id: slot.buildingId,
          kind: 'building' as const,
          productionSpent: Math.max(0, Math.round(progress * productionCost)),
          resourcePaid: true,
          slotIndex: entry.slotIndex
        }
      }).filter((e): e is NonNullable<typeof e> => e !== null),
      ...planet.queues.shipyard.map((entry) => {
        const def = getUnitDef(entry.id)
        const productionCost = def?.productionCost ?? 0
        const remaining = entry.eta ?? productionCost
        const progress = productionCost > 0 ? (productionCost - remaining) / productionCost : 0
        return {
          id: entry.id,
          kind: 'unit' as const,
          productionSpent: Math.max(0, Math.round(progress * productionCost)),
          resourcePaid: true
        }
      })
    ].slice(0, BUILD_QUEUE_LIMIT),
    shipyardQueue: [],
    stationedUnits: getStationedUnits(planet),
    location: planet.location
  }))
})

const buildQueueLimit = BUILD_QUEUE_LIMIT
const buildQueueOverrides = ref<Record<string, Array<{ id: string, kind: 'building' | 'unit', productionSpent: number, resourcePaid: boolean, slotIndex?: number }>>>({})
const buildProgressMemory = ref<Record<string, Record<string, { productionSpent: number, resourcePaid: boolean }>>>({})

const selectedPlanet = computed(() => planetsView.value.find(planet => planet.id === selectedId.value))
const selectedPlanetWithQueue = computed(() => {
  if (!selectedPlanet.value) return null
  const override = buildQueueOverrides.value[selectedPlanet.value.id]
  return {
    ...selectedPlanet.value,
    buildQueue: override ?? selectedPlanet.value.buildQueue
  }
})

const selectedPlanetProgressMemory = computed(() => {
  if (!selectedPlanet.value) return {}
  return buildProgressMemory.value[selectedPlanet.value.id] ?? {}
})

const planetsWithEffectiveQueue = computed(() => {
  const playerId = currentUserId.value ? toPlayerId(currentUserId.value) : null
  return planetsView.value
    .filter(planet => (playerId ? planet.owner === playerId : true))
    .map(planet => ({
      ...planet,
      buildQueue: buildQueueOverrides.value[planet.id] ?? planet.buildQueue
    }))
})

const planetActionCount = computed(() => {
  return planetsWithEffectiveQueue.value.filter(planet => planet.buildQueue.length < buildQueueLimit).length
})

const planetPanelOpen = ref(false)

const handleOpenPlanetFromOverview = (planetId: string) => {
  planetOverviewOpen.value = false
  handleSelectPlanet(planetId)
  planetPanelFromOverview.value = true
}

const handleBackToOverview = () => {
  planetPanelOpen.value = false
  planetOverviewOpen.value = true
}

const handleQueueBuild = (planetId: string, buildingId: string, kind: 'building' | 'unit', slotIndex?: number) => {
  const planet = planetsView.value.find(item => item.id === planetId)
  if (!planet) return
  if (currentUserId.value) {
    const playerId = toPlayerId(currentUserId.value)
    if (planet.owner !== playerId) {
      notifyError(t('game.errors.not-owner'))
      return
    }
  }
  upsertBuildCommand(planetId, kind, buildingId, slotIndex)
  const currentRaw = buildQueueOverrides.value[planetId] ?? planet.buildQueue
  const current = currentRaw.slice(0, buildQueueLimit)
  const saved = buildProgressMemory.value[planetId]?.[buildingId]
  const entry = {
    id: buildingId,
    kind,
    productionSpent: saved?.productionSpent ?? 0,
    resourcePaid: saved?.resourcePaid ?? false,
    slotIndex
  }
  let nextQueue = [...current]
  if (current.length < buildQueueLimit) {
    nextQueue = [...current, entry]
  } else {
    const replaceIndex = Math.max(0, buildQueueLimit - 1)
    const replaced = current[replaceIndex]
    if (replaced) {
      buildProgressMemory.value = {
        ...buildProgressMemory.value,
        [planetId]: {
          ...(buildProgressMemory.value[planetId] ?? {}),
          [replaced.id]: {
            productionSpent: replaced.productionSpent,
            resourcePaid: replaced.resourcePaid
          }
        }
      }
    }
    nextQueue = current.map((item, index) => (index === replaceIndex ? entry : item))
  }
  buildQueueOverrides.value = {
    ...buildQueueOverrides.value,
    [planetId]: nextQueue.slice(0, buildQueueLimit)
  }
}

const handleCancelBuild = (planetId: string) => {
  const planet = planetsView.value.find(item => item.id === planetId)
  if (!planet) return

  // Get current queue (with overrides)
  const currentQueue = buildQueueOverrides.value[planetId] ?? planet.buildQueue
  if (currentQueue.length === 0) return

  const activeBuild = currentQueue[0]
  if (!activeBuild) return

  // Save progress to memory if production has started
  if (activeBuild.productionSpent > 0) {
    buildProgressMemory.value = {
      ...buildProgressMemory.value,
      [planetId]: {
        ...(buildProgressMemory.value[planetId] ?? {}),
        [activeBuild.id]: {
          productionSpent: activeBuild.productionSpent,
          resourcePaid: activeBuild.resourcePaid
        }
      }
    }
  }

  // Remove from turnPlan commands
  turnPlan.value = {
    commands: turnPlan.value.commands.filter((command) => {
      if (command.type === 'buildStructure') {
        return command.planetId !== planetId || command.buildingId !== activeBuild.id
      }
      if (command.type === 'buildUnit') {
        return command.planetId !== planetId || command.unitId !== activeBuild.id
      }
      return true
    })
  }

  // Remove from queue override (shift queue up)
  const newQueue = currentQueue.slice(1)
  buildQueueOverrides.value = {
    ...buildQueueOverrides.value,
    [planetId]: newQueue
  }
}

const handleStartResearch = (techId: string) => {
  const started = researchStore.startResearch(techId)
  if (started) {
    setResearchCommand(techId)
  }
}

const activeGalaxyId = ref<string | null>(null)
const activeSystemId = ref<string | null>(null)

const systemGalaxyMap = computed(() => {
  const map = new Map<string, string>()
  for (const galaxy of galaxies.value) {
    for (const systemId of galaxy.solarSystems) {
      map.set(systemId, galaxy.id)
    }
  }
  return map
})

watch([galaxies, systems], ([nextGalaxies, nextSystems]) => {
  if (!activeGalaxyId.value && nextGalaxies.length) {
    activeGalaxyId.value = nextGalaxies[0]?.id ?? null
  }
  if (!activeSystemId.value && nextSystems.length) {
    activeSystemId.value = nextSystems[0]?.id ?? null
  }
  if (!selectedId.value && activeGalaxyId.value) {
    selectedId.value = activeGalaxyId.value
  }
})

const systemChildCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const planet of planetsView.value) {
    counts.set(planet.systemId, (counts.get(planet.systemId) ?? 0) + 1)
  }
  return counts
})

const systemsWithCounts = computed(() => systems.value.map(system => ({
  ...system,
  galaxyId: systemGalaxyMap.value.get(system.id) ?? null,
  childCount: systemChildCounts.value.get(system.id) ?? 0
})))

const galaxiesWithCounts = computed(() => galaxies.value.map(galaxy => ({
  ...galaxy,
  childCount: galaxy.solarSystems.length
})))

const systemsInGalaxy = computed(() => {
  if (!activeGalaxyId.value) return systemsWithCounts.value
  return systemsWithCounts.value.filter(system => system.galaxyId === activeGalaxyId.value)
})

const planetsInSystem = computed(() => {
  if (!activeSystemId.value) return planetsView.value
  return planetsView.value.filter(planet => planet.systemId === activeSystemId.value)
})

watch(() => gameTurn.value, async (turn, previousTurn) => {
  if (previousTurn && turn > previousTurn) {
    yearPulse.value = true
    turnAnimationActive.value = true
    if (turnAnimationTimer) {
      clearTimeout(turnAnimationTimer)
    }
    setTimeout(() => {
      yearPulse.value = false
    }, 1200)
    turnAnimationTimer = setTimeout(() => {
      turnAnimationActive.value = false
    }, 1200)
  }
  await loadSnapshot()
  await loadReadyState()
  turnPlan.value = { commands: [] }
  buildQueueOverrides.value = {}
  buildProgressMemory.value = {}
})

watch(() => user.value?.id, (id) => {
  if (id) currentUserId.value = id
})

const LOADING_STEPS = [
  { id: 'awakening', labelKey: 'loading.steps.awakening' },
  { id: 'memory', labelKey: 'loading.steps.memory' },
  { id: 'sensors', labelKey: 'loading.steps.sensors' },
  { id: 'systems', labelKey: 'loading.steps.systems' },
  { id: 'uplink', labelKey: 'loading.steps.uplink' }
]

const initializeGame = async () => {
  appLoading.initSteps(LOADING_STEPS)

  try {
    // Step 1: Authenticate user (AI awakening)
    currentUserId.value = await fetchUserId()
    await appLoading.completeStepWithDelay('awakening')

    if (!currentUserId.value) {
      navigateTo('/login')
      return
    }

    // Step 2: Resolve game ID + load core data (memory restoration)
    gameId.value = await resolveGameId()
    if (!gameId.value) {
      navigateTo('/lobby')
      return
    }
    await loadGameCore()
    await appLoading.completeStepWithDelay('memory')

    // Step 3: Load snapshot (sensor activation)
    await loadSnapshot()
    await appLoading.completeStepWithDelay('sensors')

    // Step 4: Load players + ready state (systems online)
    await loadPlayers()
    await loadReadyState()
    await appLoading.completeStepWithDelay('systems')

    // Step 5: Setup realtime (network uplink)
    setupRealtime()
    await appLoading.completeStepWithDelay('uplink')

    // Mark ready - user needs to press a key to continue
    await appLoading.markReady()
  } catch (error) {
    const message = error instanceof Error ? error.message : t('loading.error')
    appLoading.setError(message)
  }
}

const retryLoading = () => {
  appLoading.reset()
  initializeGame()
}

onMounted(() => {
  initializeGame()
})

onUnmounted(() => {
  if (gameChannel) supabase.removeChannel(gameChannel)
  if (turnAnimationTimer) {
    clearTimeout(turnAnimationTimer)
  }
})

const setSelection = (type: SelectionType, id?: string) => {
  selectedType.value = type
  selectedId.value = id
}

const handleSelectGalaxy = (id: string) => {
  activeGalaxyId.value = id
  viewMode.value = 'galaxy'
  const nextSystem = systemsWithCounts.value.find(system => system.galaxyId === id)
  activeSystemId.value = nextSystem?.id ?? null
  setSelection('galaxy', id)
}

const handleSelectSystem = (id: string) => {
  activeSystemId.value = id
  viewMode.value = 'system'
  setSelection('system', id)
}

const handleSelectPlanet = (id: string) => {
  setSelection('planet', id)
  viewMode.value = 'planet'
  planetPanelFromOverview.value = false
}

const handleExitPlanetView = () => {
  viewMode.value = 'system'
}

const handleViewModeChange = (mode: MapViewMode) => {
  viewMode.value = mode
  if (mode === 'galaxy') {
    if (activeGalaxyId.value) setSelection('galaxy', activeGalaxyId.value)
  }
  if (mode === 'universe') {
    if (activeGalaxyId.value) setSelection('galaxy', activeGalaxyId.value)
  }
  if (mode === 'system') {
    if (activeSystemId.value) setSelection('system', activeSystemId.value)
  }
}

watch(() => selectedType.value, (type) => {
  if (type !== 'planet') {
    planetPanelOpen.value = false
    if (viewMode.value === 'planet') {
      viewMode.value = 'system'
    }
  }
})
</script>

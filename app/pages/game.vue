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

      <!-- Victory countdown (telegraphed to everyone once a player qualifies) -->
      <GameVictoryBanner
        v-if="victoryCountdown"
        :countdown="victoryCountdown"
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
          :owned-ids="ownedMapIds"
          :color-by-id="colorById"
          :star-id="activeSystemStarId ?? undefined"
          @select-planet="handleSelectPlanet"
          @select-system="handleSelectSystem"
          @select-galaxy="handleSelectGalaxy"
          @update:view-mode="handleViewModeChange"
        />

        <!-- Jump to home system -->
        <UButton
          v-if="homeSystemId && viewMode !== 'planet'"
          icon="i-lucide-house"
          color="primary"
          variant="solid"
          size="sm"
          data-testid="home-button"
          class="absolute top-4 right-4 z-20 shadow-lg"
          @click="goHome"
        >
          {{ $t('game.navigation.home') }}
        </UButton>

        <GamePlanetSlotView
          v-if="viewMode === 'planet' && selectedPlanetWithQueue"
          :planet="selectedPlanetWithQueue"
          :building-catalog="planetBuildCatalog"
          :unit-catalog="unitCatalog"
          :can-build="planetCanBuild"
          :build-queue-limit="buildQueueLimit"
          :player-resources="playerResources"
          @close="handleExitPlanetView"
          @queue-build="handleQueueBuild"
          @remove-queue-item="handleRemoveQueueItem"
          @reorder-queue="handleReorderQueue"
        />

        <GameStarSlotView
          v-if="viewMode === 'planet' && selectedStarWithQueue"
          :star="selectedStarWithQueue"
          :building-catalog="starBuildingCatalog"
          :unit-catalog="unitCatalog"
          :can-build="starCanBuild"
          :build-queue-limit="buildQueueLimit"
          :player-resources="playerResources"
          @close="handleExitPlanetView"
          @queue-build="handleQueueBuild"
          @remove-queue-item="handleRemoveQueueItem"
          @reorder-queue="handleReorderQueue"
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

        <!-- Fleet panel (system view) -->
        <div
          v-if="viewMode === 'system' && myFleetsInActiveSystem.length > 0 && !planetPanelOpen && !planetOverviewOpen && !eventLogStore.isOpen && !researchStore.isOpen"
          data-testid="fleet-panel"
          class="absolute bottom-6 left-6 z-20 w-80 rounded-lg border border-primary-500/30 bg-neutral-900/95 shadow-lg shadow-primary-500/10 p-4 space-y-3"
        >
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-rocket"
              class="w-4 h-4 text-primary-300"
            />
            <span class="text-sm font-semibold text-neutral-100">{{ $t('game.fleet.title') }}</span>
          </div>
          <div
            v-for="fleet in myFleetsInActiveSystem"
            :key="fleet.id"
            :data-testid="`fleet-row-${fleet.id}`"
            class="rounded-md border border-neutral-700/50 bg-neutral-900/70 p-2 space-y-1.5"
          >
            <div class="flex items-center gap-2">
              <UIcon
                :name="fleet.icon"
                class="w-4 h-4 text-primary-200"
              />
              <span class="text-sm text-neutral-100">{{ fleet.name }}</span>
              <span
                v-if="fleet.status === 'en-route' && fleet.destinationName"
                class="ml-auto text-[11px] text-info-300"
              >
                → {{ fleet.destinationName }} · {{ $t('game.common.duration-rounds', { count: fleet.eta }) }}
              </span>
              <span
                v-else
                class="ml-auto text-[11px] text-neutral-500"
              >{{ $t('game.fleet.idle') }}</span>
            </div>
            <select
              class="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
              :value="fleet.pendingTargetId"
              data-testid="fleet-move-select"
              @change="handleFleetMoveOrder(fleet.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                {{ $t('game.fleet.keep') }}
              </option>
              <option
                v-for="target in fleetMoveTargets"
                :key="target.id"
                :value="target.id"
              >
                {{ target.name }} — {{ $t('game.common.duration-rounds', { count: target.eta }) }}
              </option>
            </select>
          </div>
        </div>

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

      <!-- Game over -->
      <GameVictoryOverlay
        v-if="victoryResult"
        :result="victoryResult"
        @home="navigateTo('/lobby')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { BASE_PLANET_PRODUCTION, BUILDING_DEFS, BUILD_QUEUE_LIMIT, UNIT_DEFS, getBuildingDef, getMissingResearch } from '~~/shared/defs/production'
import { findDistrictNode } from '~~/shared/defs/districts'
import { DISTRICT_ICONS, buildableDistrictNodes, hasResearchDistrict } from '~~/shared/utils/districts'
import { TECH_DEFS } from '~~/shared/defs/research-tree'
import { validateTurnPlan } from '~~/shared/validation/turnPlan'
import { toPlayerId } from '~~/shared/utils/playerId'
import { UNCLAIMED_COLOR } from '~~/shared/defs/playerColors'
import { STRATEGIC_RESOURCES, getStrategicResource, isStrategicResource } from '~~/shared/defs/strategicResources'
import { getResearchPointsPerTurn, planetProductionPerTurn, resourceProductionBreakdown } from '~~/shared/utils/economy'
import type { ProductionResourceKind } from '~~/shared/utils/economy'
import { queueItemCosts, reconcileProductionQueue } from '~~/shared/utils/productionQueue'
import { getLaneEta, getSystemIdForLocation } from '~~/shared/utils/starlanes'

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
  /** Production grouped by planet then building, for the hover tooltip ("where does this come from?"). */
  breakdown?: Array<{ planetName: string, total: number, sources: Array<{ label: string, amount: number }> }>
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
  productionPerRound: number
  buildings: Array<{ id: string, level: number, isConstructing?: boolean }>
  slots: Array<{ buildingId: string | null, buildingLevel: number, isConstructing: boolean, constructionTimeLeft: number, zone: string, resourceNode: string | null, districtType?: string | null, nodes?: string[] }>
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
  site: 'planet' | 'star'
  resourceProduction?: Partial<Record<'energy' | 'minerals' | 'rare', number>>
  researchPoints?: number
  strategicProduction?: { resource: string, amount: number, requiresNode: string }
  strategicCosts?: Partial<Record<string, number>>
  locked: boolean
  lockedByTechName: string | null
  /** District-node catalog extras: the slots this node may target + its district. */
  validSlots?: number[]
  districtType?: string
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
  strategicCosts?: Partial<Record<string, number>>
  locked: boolean
  lockedByTechName: string | null
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
const gamePlayers = ref<Array<{ id: string, name: string, color: string | null }>>([])
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

const setResearchCommand = (researchId: string) => {
  const next: TurnCommand[] = turnPlan.value.commands.filter(command => command.type !== 'startResearch')
  next.push({ type: 'startResearch', researchId: researchId as ResearchId })
  turnPlan.value = { commands: next }
}

const planetOverviewOpen = ref(false)

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
    .select('user_id, color')
    .eq('game_id', gameId.value)

  if (error) {
    notifyError(error.message)
    return
  }

  const userIds = (data ?? []).map(row => row.user_id)
  const colorMap = Object.fromEntries((data ?? []).map(row => [row.user_id, (row.color as string | null) ?? null]))
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
  gamePlayers.value = userIds.map(id => ({ id, name: nameMap[id] ?? id, color: colorMap[id] ?? null }))
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
      const points = getResearchPointsPerTurn(snapshot.value.planets, player.id)
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
  'res:rare': { labelKey: 'game.resources.rare', icon: 'atom', accent: 'text-primary-300' },
  'res:exotic-matter': { labelKey: 'game.resources.exotic-matter', icon: 'gem', accent: 'text-fuchsia-300' },
  'res:antimatter': { labelKey: 'game.resources.antimatter', icon: 'orbit', accent: 'text-cyan-300' }
}

/** Base resources whose per-building production breakdown is shown in the TopBar tooltip. */
const RESOURCE_KIND_BY_KEY: Record<string, ProductionResourceKind> = {
  'res:energy': 'energy',
  'res:material': 'minerals',
  'res:rare': 'rare'
}

// Calculate pending resource costs from turnPlan commands (optimistic updates).
// Mirrors the server: only newly-added queue items are charged (resumes are free),
// classified by the same reconcileProductionQueue helper.
const pendingResourceCosts = computed(() => {
  const costs = { energy: 0, minerals: 0, rare: 0 }
  if (!snapshot.value) return costs

  for (const command of turnPlan.value.commands) {
    if (command.type !== 'setProductionQueue') continue
    const planet = snapshot.value.planets.find(p => p.id === command.planetId)
    if (!planet) continue
    const { isNew } = reconcileProductionQueue(planet, command.items)
    for (const cost of queueItemCosts(planet, command.items, isNew)) {
      costs.energy += cost.energy
      costs.minerals += cost.minerals
      costs.rare += cost.rare
    }
  }

  return costs
})

const resources = computed((): GameResource[] => {
  if (!snapshot.value || !currentUserId.value) return []
  const playerId = toPlayerId(currentUserId.value)
  const player = snapshot.value.players.find(p => p.id === playerId || p.userId === currentUserId.value)
  const completed = completedTechIds.value
  // Hide a strategic resource until it is discovered (survey tech done) or already mined.
  const list = (player?.resources ?? []).filter((resource) => {
    if (!isStrategicResource(resource.key)) return true
    if (resource.current > 0) return true
    const surveyTech = getStrategicResource(resource.key)?.surveyTech
    return surveyTech ? completed.includes(surveyTech) : true
  })
  const pending = pendingResourceCosts.value
  const breakdownAll = playerId ? resourceProductionBreakdown(snapshot.value.planets, playerId) : null

  return list.map((resource) => {
    const meta = resourceMeta[resource.key] ?? { labelKey: resource.key, icon: 'circle', accent: 'text-neutral-300' }
    const delta = resource.delta ?? 0
    const deltaLabel = `${delta >= 0 ? '+' : ''}${delta}`

    // Subtract pending costs for this resource type
    let amount = resource.current
    if (resource.key === 'res:energy') amount -= pending.energy
    else if (resource.key === 'res:material') amount -= pending.minerals
    else if (resource.key === 'res:rare') amount -= pending.rare

    const kind = RESOURCE_KIND_BY_KEY[resource.key]
    const breakdown = kind && breakdownAll
      ? breakdownAll[kind].map(group => ({
          planetName: group.planetName,
          total: group.total,
          sources: group.sources.map(source => ({ label: buildingDisplayName(source.buildingId), amount: source.amount }))
        }))
      : []

    return {
      key: resource.key,
      label: te(meta.labelKey) ? t(meta.labelKey) : meta.labelKey,
      amount,
      delta: deltaLabel,
      accent: meta.accent,
      icon: meta.icon,
      breakdown
    }
  })
})

const playerResources = computed(() => {
  if (!snapshot.value || !currentUserId.value) return { energy: 0, minerals: 0, rare: 0, strategic: {} as Record<string, number> }
  const playerId = toPlayerId(currentUserId.value)
  const player = snapshot.value.players.find(p => p.id === playerId || p.userId === currentUserId.value)
  const list = player?.resources ?? []
  const pending = pendingResourceCosts.value

  const strategic: Record<string, number> = {}
  for (const r of STRATEGIC_RESOURCES) {
    strategic[r.id] = list.find(res => res.key === r.id)?.current ?? 0
  }

  return {
    energy: (list.find(r => r.key === 'res:energy')?.current ?? 0) - pending.energy,
    minerals: (list.find(r => r.key === 'res:material')?.current ?? 0) - pending.minerals,
    rare: (list.find(r => r.key === 'res:rare')?.current ?? 0) - pending.rare,
    strategic
  }
})

const buildingNameKey = (id: string) => `game.buildings.${id.replace('bld:', '')}.name`
const buildingDisplayName = (id: string) => (te(buildingNameKey(id)) ? t(buildingNameKey(id)) : id)
const buildingDescriptionKey = (id: string) => `game.buildings.${id.replace('bld:', '')}.description`
const unitNameKey = (id: string) => `game.units.${id.replace('unit:', '')}.name`
const unitRoleKey = (id: string) => `game.units.${id.replace('unit:', '')}.role`
const techNameKey = (id: string) => `game.research.techs.${id.replace('tech:', '')}.name`

const techDisplayName = (techId: string) => {
  const key = techNameKey(techId)
  if (te(key)) return t(key)
  return TECH_DEFS.find(tech => tech.id === techId)?.name ?? techId
}

const completedTechIds = computed((): string[] => {
  if (!snapshot.value || !currentUserId.value) return []
  const playerId = toPlayerId(currentUserId.value)
  const player = snapshot.value.players.find(p => p.id === playerId || p.userId === currentUserId.value)
  return player?.research.completedTechIds ?? []
})

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

const allBuildingCatalog = computed((): BuildingDefinition[] => BUILDING_DEFS.map((def) => {
  const missingResearch = getMissingResearch(def.requirements, completedTechIds.value)
  return {
    id: def.id,
    name: te(buildingNameKey(def.id)) ? t(buildingNameKey(def.id)) : def.id,
    description: te(buildingDescriptionKey(def.id)) ? t(buildingDescriptionKey(def.id)) : '',
    category: def.category,
    maxLevel: def.maxLevel ?? 1,
    resourceCosts: def.resourceCosts,
    productionCost: def.productionCost,
    icon: def.icon ?? 'i-lucide-hammer',
    site: def.site ?? 'planet',
    resourceProduction: def.resourceProduction,
    researchPoints: def.researchPoints,
    strategicProduction: def.strategicProduction,
    strategicCosts: def.strategicCosts,
    locked: missingResearch.length > 0,
    lockedByTechName: missingResearch.length > 0 ? techDisplayName(missingResearch[0]!) : null
  }
}))

// Planet panels only see planet buildings; the star panel only sees megastructures.
const buildingCatalog = computed((): BuildingDefinition[] => allBuildingCatalog.value.filter(b => b.site !== 'star'))
const starBuildingCatalog = computed((): BuildingDefinition[] => allBuildingCatalog.value.filter(b => b.site === 'star'))

// Districts: the buildable nodes for the OPEN planet, each carrying the slots it may
// target. Mirrors the engine's district rules so the catalog and server agree.
const selectedRawPlanet = computed(() => planets.value.find(p => p.id === selectedId.value) ?? null)
// A Research district must be established (the data center houses the AI core) before
// any other district can be founded — so the first build of the game is the data center.
const myOwnedPlanets = computed(() =>
  myPlayerId.value ? planets.value.filter(p => p.owner === myPlayerId.value) : [])
const researchEstablished = computed(() => hasResearchDistrict(myOwnedPlanets.value))
const planetBuildCatalog = computed((): BuildingDefinition[] => {
  const planet = selectedRawPlanet.value
  if (!planet || planet.kind === 'star') return []
  return buildableDistrictNodes(planet, completedTechIds.value, researchEstablished.value).map((n) => {
    const nameKey = buildingNameKey(n.nodeId)
    const descKey = buildingDescriptionKey(n.nodeId)
    const buildingName = te(nameKey) ? t(nameKey) : n.nodeId
    const districtName = `${t(`game.districts.${n.districtType}`)} ${t('game.districts.label')}`
    return {
      id: n.nodeId,
      // Founding a district is labelled by the DISTRICT; the building it places shows as
      // the description ("Solar Array" is a building IN the Energy district, not the name).
      name: n.isBase ? districtName : buildingName,
      description: n.isBase ? buildingName : (te(descKey) ? t(descKey) : ''),
      category: 'infrastructure' as BuildingCategory,
      maxLevel: 1,
      resourceCosts: { energy: n.cost.energy ?? 0, minerals: n.cost.matter ?? 0, rare: 0 },
      productionCost: n.buildTime * BASE_PLANET_PRODUCTION,
      icon: getBuildingDef(n.nodeId)?.icon ?? DISTRICT_ICONS[n.districtType],
      site: 'planet' as const,
      resourceProduction: { energy: n.output.energy, minerals: n.output.matter },
      researchPoints: n.output.research,
      strategicCosts: n.cost.strategic,
      locked: n.locked,
      lockedByTechName: null,
      validSlots: n.validSlots,
      districtType: n.districtType
    }
  })
})

const unitCatalog = computed((): UnitDefinition[] => {
  return UNIT_DEFS.map((def) => {
    const missingResearch = getMissingResearch(def.requirements, completedTechIds.value)
    return {
      id: def.id,
      name: te(unitNameKey(def.id)) ? t(unitNameKey(def.id)) : def.id,
      role: te(unitRoleKey(def.id)) ? t(unitRoleKey(def.id)) : '',
      category: def.category,
      resourceCosts: def.resourceCosts,
      productionCost: def.productionCost,
      icon: def.icon ?? 'i-lucide-rocket',
      requiresFacility: (def.requirements.buildings?.length ?? 0) > 0,
      strategicCosts: def.strategicCosts,
      locked: missingResearch.length > 0,
      lockedByTechName: missingResearch.length > 0 ? techDisplayName(missingResearch[0]!) : null
    }
  })
})

const getStationedUnits = (planet: Planet): Array<{ unitDefId: string, count: number }> => {
  const result: Array<{ unitDefId: string, count: number }> = []
  const fleets = snapshot.value?.fleets ?? []
  const counts = new Map<string, number>()
  for (const f of fleets) {
    if (f.location === planet.id) {
      const defId = f.defId ?? f.id
      counts.set(defId, (counts.get(defId) ?? 0) + 1)
    }
  }
  for (const [unitDefId, count] of counts.entries()) {
    result.push({ unitDefId, count })
  }
  return result
}

// ── Fleets & movement orders ──────────────────────────────────────────
const myFleetsInActiveSystem = computed(() => {
  if (!snapshot.value || !currentUserId.value || !activeSystemId.value) return []
  const playerId = toPlayerId(currentUserId.value)
  return snapshot.value.fleets
    .filter(fleet => fleet.ownerId === playerId)
    .map((fleet) => {
      const defId = fleet.defId ?? fleet.id
      const catalogEntry = unitCatalog.value.find(unit => unit.id === defId)
      const pending = turnPlan.value.commands.find(
        command => command.type === 'moveFleet' && command.fleetId === fleet.id
      )
      return {
        id: fleet.id,
        name: catalogEntry?.name ?? defId,
        icon: catalogEntry?.icon ?? 'i-lucide-rocket',
        systemId: getSystemIdForLocation(snapshot.value!, fleet.location),
        status: fleet.status,
        eta: fleet.eta ?? 0,
        destinationName: fleet.destination
          ? (systemNameById.value.get(fleet.destination as never) ?? fleet.destination)
          : null,
        pendingTargetId: pending?.type === 'moveFleet' ? pending.toSystemId as string : ''
      }
    })
    .filter(fleet => fleet.systemId === activeSystemId.value)
})

const fleetMoveTargets = computed(() => {
  if (!snapshot.value || !activeSystemId.value) return []
  const fromId = activeSystemId.value as SolarSystemId
  return snapshot.value.systems
    .filter(system => system.id !== fromId)
    .map(system => ({
      id: system.id,
      name: system.name,
      eta: getLaneEta(snapshot.value!.systems, fromId, system.id)
    }))
    .filter((target): target is typeof target & { eta: number } => target.eta !== null)
})

const handleFleetMoveOrder = (fleetId: string, toSystemId: string) => {
  const next: TurnCommand[] = turnPlan.value.commands.filter(
    command => !(command.type === 'moveFleet' && command.fleetId === fleetId)
  )
  if (toSystemId) {
    next.push({ type: 'moveFleet', fleetId: fleetId as UnitId, toSystemId: toSystemId as SolarSystemId })
  }
  turnPlan.value = { commands: next }
}

// Map a raw Planet (incl. stars) to the view shape used by the build panels.
const toPlanetView = (planet: Planet): GamePlanet => ({
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
  productionPerRound: planetProductionPerTurn(planet),
  buildings: planet.slots
    .filter(s => s.buildingId && !s.isConstructing)
    .map(s => ({ id: s.buildingId!, level: s.buildingLevel })),
  slots: planet.slots.map(s => ({
    buildingId: s.buildingId,
    buildingLevel: s.buildingLevel,
    isConstructing: s.isConstructing,
    constructionTimeLeft: s.constructionTimeLeft,
    zone: s.zone,
    resourceNode: s.resourceNode,
    districtType: s.districtType ?? null,
    nodes: s.nodes ?? []
  })),
  buildQueue: (planet.queues.production ?? []).map((entry) => {
    if (entry.kind === 'building') {
      const slot = planet.slots[entry.slotIndex]
      if (!slot?.buildingId) return null
      const districtNode = findDistrictNode(slot.buildingId)
      const productionCost = districtNode
        ? districtNode.node.buildTime * BASE_PLANET_PRODUCTION
        : (getBuildingDef(slot.buildingId)?.productionCost ?? 0)
      const spent = Math.max(0, productionCost - slot.constructionTimeLeft)
      return {
        id: slot.buildingId,
        kind: 'building' as const,
        productionSpent: spent,
        resourcePaid: true,
        slotIndex: entry.slotIndex
      }
    }
    return {
      id: entry.unitId,
      kind: 'unit' as const,
      productionSpent: entry.productionSpent,
      resourcePaid: true
    }
  }).filter((e): e is NonNullable<typeof e> => e !== null).slice(0, BUILD_QUEUE_LIMIT),
  shipyardQueue: [],
  stationedUnits: getStationedUnits(planet),
  location: planet.location
})

const planetsView = computed((): GamePlanet[] =>
  planets.value.filter(planet => planet.kind !== 'star').map(toPlanetView))

const starsView = computed((): GamePlanet[] =>
  planets.value.filter(planet => planet.kind === 'star').map(toPlanetView))

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
// You can only build on a planet you own (enemy/unclaimed worlds open read-only).
const planetCanBuild = computed(() =>
  Boolean(selectedPlanet.value && myPlayerId.value && selectedPlanet.value.owner === myPlayerId.value))

const planetsWithEffectiveQueue = computed(() => {
  const playerId = currentUserId.value ? toPlayerId(currentUserId.value) : null
  return planetsView.value
    .filter(planet => (playerId ? planet.owner === playerId : true))
    .map(planet => ({
      ...planet,
      buildQueue: buildQueueOverrides.value[planet.id] ?? planet.buildQueue
    }))
})

// A planet "needs action" when its production queue is empty (idle → wasting output).
const planetActionCount = computed(() => {
  return planetsWithEffectiveQueue.value.filter(planet => planet.buildQueue.length === 0).length
})

// Kept only as a template guard (the dedicated PlanetPanel was removed; the slot
// view is the single planet builder now). Always false.
const planetPanelOpen = ref(false)

const handleOpenPlanetFromOverview = (planetId: string) => {
  planetOverviewOpen.value = false
  handleSelectPlanet(planetId)
}

type QueueEntry = { id: string, kind: 'building' | 'unit', productionSpent: number, resourcePaid: boolean, slotIndex?: number }

// The override is the client's desired queue for a planet. It starts as a copy of
// the server queue (so in-progress builds are preserved) the first time the player
// touches the planet; planets the player never touches send no command and keep
// their server queue across turns.
const effectiveQueue = (planetId: string): QueueEntry[] => {
  const existing = buildQueueOverrides.value[planetId]
  if (existing) return existing
  const planet = buildSites.value.find(item => item.id === planetId)
  return [...(planet?.buildQueue ?? [])]
}

const isOwnedSite = (planetId: string): boolean => {
  const planet = buildSites.value.find(item => item.id === planetId)
  if (!planet) return false
  if (!currentUserId.value) return true
  if (planet.owner !== toPlayerId(currentUserId.value)) {
    notifyError(t('game.errors.not-owner'))
    return false
  }
  return true
}

// Rebuild the planet's single setProductionQueue command from its desired queue and
// store the override. Declarative: add/remove/reorder all funnel through here.
const commitQueue = (planetId: string, queue: QueueEntry[]) => {
  buildQueueOverrides.value = { ...buildQueueOverrides.value, [planetId]: queue }
  const items: ProductionQueueCommandItem[] = queue.map(entry =>
    entry.kind === 'building'
      ? { kind: 'building', slotIndex: entry.slotIndex ?? 0, buildingId: entry.id as BuildingId }
      : { kind: 'unit', unitId: entry.id as UnitId }
  )
  const next: TurnCommand[] = turnPlan.value.commands.filter(command =>
    !(command.type === 'setProductionQueue' && command.planetId === planetId))
  next.push({ type: 'setProductionQueue', planetId: planetId as PlanetId, items })
  turnPlan.value = { commands: next }
}

const handleQueueBuild = (planetId: string, buildId: string, kind: 'building' | 'unit', slotIndex?: number) => {
  if (!isOwnedSite(planetId)) return
  const current = effectiveQueue(planetId)
  if (current.length >= buildQueueLimit) {
    notifyError(t('game.errors.queue-full'))
    return
  }
  // Buildings target a free slot; refuse a slot already targeted by a queued build.
  if (kind === 'building' && current.some(e => e.kind === 'building' && e.slotIndex === slotIndex)) return
  commitQueue(planetId, [...current, { id: buildId, kind, productionSpent: 0, resourcePaid: false, slotIndex }])
}

const handleRemoveQueueItem = (planetId: string, index: number) => {
  if (!isOwnedSite(planetId)) return
  const current = effectiveQueue(planetId)
  if (index < 0 || index >= current.length) return
  commitQueue(planetId, current.filter((_, i) => i !== index))
}

const handleReorderQueue = (planetId: string, from: number, to: number) => {
  if (!isOwnedSite(planetId)) return
  const current = [...effectiveQueue(planetId)]
  if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) return
  const [moved] = current.splice(from, 1)
  if (!moved) return
  current.splice(to, 0, moved)
  commitQueue(planetId, current)
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

const myPlayerId = computed(() => (currentUserId.value ? toPlayerId(currentUserId.value) : null))

// Ids of every map node (planet, its system, its galaxy) the player owns,
// so the map can mark "yours".
const ownedMapIds = computed(() => {
  const ids: string[] = []
  const playerId = myPlayerId.value
  if (!playerId) return ids
  for (const planet of planets.value) {
    if (planet.owner !== playerId) continue
    ids.push(planet.id, planet.systemId)
    const galaxyId = systemGalaxyMap.value.get(planet.systemId)
    if (galaxyId) ids.push(galaxyId)
  }
  return Array.from(new Set(ids))
})

const myColor = computed(() =>
  gamePlayers.value.find(p => p.id === currentUserId.value)?.color ?? null)

/** Owner PlayerId → chosen colour (from game_players, joined via snapshot.userId). */
const playerColorByOwner = computed(() => {
  const byUserId = new Map(gamePlayers.value.map(p => [p.id, p.color]))
  const map = new Map<string, string>()
  for (const player of snapshot.value?.players ?? []) {
    const color = byUserId.get(player.userId)
    if (color) map.set(player.id, color)
  }
  return map
})

/** Map node id → ring colour: planets by owner (grey if unclaimed), my systems/galaxies in my colour. */
const colorById = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {}
  for (const planet of planets.value) {
    result[planet.id] = playerColorByOwner.value.get(planet.owner) ?? UNCLAIMED_COLOR
  }
  const mine = myColor.value
  if (mine) {
    for (const id of ownedMapIds.value) result[id] ??= mine
  }
  return result
})

// ── Victory: countdown banner + game-over overlay ──────────────────────
const victoryResult = computed(() => {
  const v = snapshot.value?.victory
  if (!v?.winnerId) return null
  return {
    isMine: v.winnerId === myPlayerId.value,
    winnerName: playerNameById.value.get(v.winnerId) ?? v.winnerId,
    condition: v.winningCondition ?? 'military',
    color: playerColorByOwner.value.get(v.winnerId) ?? UNCLAIMED_COLOR
  }
})

const victoryCountdown = computed(() => {
  const v = snapshot.value?.victory
  if (!v || v.winnerId || !v.pending.length) return null
  // Surface the most advanced countdown (soonest win).
  const entry = [...v.pending].sort((a, b) => a.winTurn - b.winTurn)[0]!
  return {
    isMine: entry.playerId === myPlayerId.value,
    playerName: playerNameById.value.get(entry.playerId) ?? entry.playerId,
    condition: entry.condition,
    turns: Math.max(0, entry.winTurn - gameTurn.value),
    color: playerColorByOwner.value.get(entry.playerId) ?? UNCLAIMED_COLOR
  }
})

/** The star of the currently viewed system (rendered as the central sun, carries an ownership ring). */
const activeSystemStarId = computed(() =>
  planets.value.find(p => p.kind === 'star' && p.systemId === activeSystemId.value)?.id ?? null)

// ── Star build panel (megastructures) ─────────────────────────────────
const selectedStar = computed(() => starsView.value.find(s => s.id === selectedId.value))
const selectedStarWithQueue = computed(() => {
  if (!selectedStar.value) return null
  const override = buildQueueOverrides.value[selectedStar.value.id]
  return { ...selectedStar.value, buildQueue: override ?? selectedStar.value.buildQueue }
})
const starCanBuild = computed(() =>
  Boolean(selectedStar.value && myPlayerId.value && selectedStar.value.owner === myPlayerId.value))

/** Every buildable site (planets + captured/visible stars) for build-command lookups. */
const buildSites = computed((): GamePlanet[] => [...planetsView.value, ...starsView.value])

const homeSystemId = computed(() => {
  const playerId = myPlayerId.value
  if (!playerId) return null
  return planets.value.find(p => p.owner === playerId)?.systemId ?? null
})

const goHome = () => {
  const systemId = homeSystemId.value
  if (!systemId) return
  const galaxyId = systemGalaxyMap.value.get(systemId)
  if (galaxyId) activeGalaxyId.value = galaxyId
  activeSystemId.value = systemId
  viewMode.value = 'system'
  setSelection('system', systemId)
}

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

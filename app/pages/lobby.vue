<script setup lang="ts">
import { PLAYER_COLORS, UNCLAIMED_COLOR, nextFreeColor } from '~~/shared/defs/playerColors'

const { t } = useI18n()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const authFetch = useAuthFetch()

const lobbies = ref<Lobby[]>([])
const members = ref<LobbyPlayer[]>([])
const myLobbyId = ref<string | null>(null)
const lobbyName = ref('')
const loading = ref(false)
const creating = ref(false)
const joining = ref<string | null>(null)
const playerCounts = ref<Record<string, number>>({})
const hostnames = ref<Record<string, string>>({})
const userIdRef = ref<string | null>(null)
let channel: ReturnType<typeof supabase.channel> | null = null

type LobbyPlayer = {
  user_id: string
  is_host?: boolean | null
  color?: string | null
  profiles?: {
    username?: string | null
  } | null
}

type Lobby = {
  id: string
  name: string
  status: 'open' | 'started' | 'closed'
  created_at: string
  host_id: string
  game_id?: string | null
  host?: {
    username?: string | null
  } | null
  lobby_players?: { count: number | null }[] | null
}

const hostNameFor = (id: string | null | undefined) => {
  if (!id) return t('lobby.commander')
  const fromMap = hostnames.value[id]
  if (fromMap) return fromMap
  const fromMembers = members.value.find(p => p.user_id === id)?.profiles?.username
  return fromMembers || t('lobby.commander')
}

const currentLobby = computed(() => lobbies.value.find(lobby => lobby.id === myLobbyId.value) ?? null)
const isHost = computed(() => currentLobby.value?.host_id === userIdRef.value)
const memberCount = computed(() => members.value.length)

const getUserId = async (): Promise<string | null> => {
  if (user.value?.id) {
    userIdRef.value = user.value.id
    return user.value.id
  }
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  userIdRef.value = data.user.id
  return data.user.id
}

const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    displayError(error)
    return
  }

  if (channel) supabase.removeChannel(channel)
  lobbies.value = []
  members.value = []
  myLobbyId.value = null

  console.log(t('lobby.logged-out'))

  await navigateTo('/')
}

watchEffect(() => {
  if (!user.value) navigateTo('/')
})

const refreshLobbies = async () => {
  const userId = await getUserId()
  if (!userId) {
    loading.value = false
    return
  }
  loading.value = true

  const { data, error } = await supabase
    .from('lobbies')
    .select('id, name, status, created_at, host_id, game_id, lobby_players(count)')
    .order('created_at', { ascending: false })

  if (error) {
    displayError(error)
  } else if (data) {
    lobbies.value = data as unknown as Lobby[]
    playerCounts.value = Object.fromEntries(data.map(lobby => [lobby.id, lobby.lobby_players?.[0]?.count ?? 0]))

    const { data: membershipData, error: membershipError } = await supabase
      .from('lobby_players')
      .select('lobby_id')
      .eq('user_id', userId)
      .limit(1)

    if (membershipError) {
      displayError(membershipError)
    } else {
      myLobbyId.value = membershipData?.[0]?.lobby_id ?? null
      if (myLobbyId.value) await loadMembers(myLobbyId.value)
      else members.value = []
    }

    const hostIds = Array.from(new Set(data.map(lobby => lobby.host_id).filter(Boolean))) as string[]
    if (hostIds.length) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', hostIds)

      if (profilesError) displayError(profilesError)
      else hostnames.value = Object.fromEntries(profilesData?.map(p => [p.id, p.username || t('lobby.unknown')]) || [])
    } else {
      hostnames.value = {}
    }
  } else {
    lobbies.value = []
    playerCounts.value = {}
    hostnames.value = {}
  }

  loading.value = false
}

const loadMembers = async (lobbyId: string) => {
  const { data, error } = await supabase
    .from('lobby_players')
    .select('user_id, is_host, color, joined_at')
    // Stable join order so the roster doesn't reshuffle when a row is updated
    // (e.g. picking a colour) — Postgres returns no implicit order otherwise.
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })

  if (error) {
    displayError(error)
    return
  }

  const profileIds = data?.map(player => player.user_id) || []
  let nameMap: Record<string, string> = {}
  if (profileIds.length) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', profileIds)

    if (profileError) displayError(profileError)
    else nameMap = Object.fromEntries(profileRows?.map(p => [p.id, p.username || t('lobby.commander')]) || [])
  }

  members.value = (data || []).map(player => ({
    ...player,
    profiles: { username: nameMap[player.user_id] || t('lobby.commander') }
  }))
}

const colorOptions = PLAYER_COLORS
const unclaimedColor = UNCLAIMED_COLOR

const myColor = computed(() =>
  members.value.find(p => p.user_id === userIdRef.value)?.color ?? null)

const colorTakenBy = (color: string) =>
  members.value.find(p => p.color === color && p.user_id !== userIdRef.value)

const chooseColor = async (color: string) => {
  const userId = await getUserId()
  if (!userId || !myLobbyId.value) return
  if (colorTakenBy(color)) return
  const { error } = await supabase
    .from('lobby_players')
    .update({ color })
    .match({ lobby_id: myLobbyId.value, user_id: userId })
  if (error) displayError(error)
  else await loadMembers(myLobbyId.value)
}

const leaveCurrentLobby = async () => {
  const userId = await getUserId()
  if (!userId || !myLobbyId.value) return
  const lobbyId = myLobbyId.value
  const hostId = currentLobby.value?.host_id

  if (isHost.value) {
    const { error } = await supabase.from('lobbies').delete().match({ id: lobbyId, host_id: userId })
    if (error) {
      displayError(error)
      await supabase.from('lobby_players').delete().match({ lobby_id: lobbyId, user_id: userId })
    } else {
      await supabase.from('lobby_players').delete().match({ lobby_id: lobbyId })
      await supabase.from('lobbies').delete().match({ id: lobbyId })
    }
  } else {
    const { error } = await supabase.from('lobby_players').delete().match({ lobby_id: lobbyId, user_id: userId })
    if (error) displayError(error)
    const { count } = await supabase
      .from('lobby_players')
      .select('*', { count: 'exact', head: true })
      .eq('lobby_id', lobbyId)

    if ((count ?? 0) === 0 && hostId) {
      await supabase.from('lobbies').delete().match({ id: lobbyId, host_id: hostId })
    }
  }

  myLobbyId.value = null
  members.value = []
  lobbies.value = lobbies.value.filter(l => l.id !== lobbyId)
  const { [lobbyId]: _, ...updatedCounts } = playerCounts.value
  playerCounts.value = updatedCounts
  await refreshLobbies()
}

const createLobby = async () => {
  const userId = await getUserId()
  if (!userId) {
    displayError({ message: t('lobby.not-logged-in') })
    return
  }
  creating.value = true

  const fallbackName = `Crew ${new Date().toLocaleTimeString('en-US', { hour12: false })}`
  const finalName = lobbyName.value.trim() || fallbackName

  const { data, error } = await supabase
    .from('lobbies')
    .insert({ name: finalName, host_id: userId, status: 'open' })
    .select()
    .single()

  if (error) {
    displayError(error)
  } else if (data) {
    const { error: joinError } = await supabase
      .from('lobby_players')
      .upsert({ lobby_id: data.id, user_id: userId, is_host: true, color: nextFreeColor([]) })

    if (joinError) {
      displayError(joinError)
      return
    }

    myLobbyId.value = data.id
    lobbyName.value = ''
    await refreshLobbies()
  }

  creating.value = false
}

const joinLobby = async (lobbyId: string) => {
  const userId = await getUserId()
  if (!userId) {
    displayError({ message: t('lobby.not-logged-in') })
    return
  }
  joining.value = lobbyId
  await leaveCurrentLobby()

  // Auto-assign the next free colour so there's never a "no colour" state.
  const { data: existingPlayers } = await supabase
    .from('lobby_players')
    .select('color')
    .eq('lobby_id', lobbyId)
  const color = nextFreeColor((existingPlayers ?? []).map(p => p.color))

  const { error } = await supabase
    .from('lobby_players')
    .upsert({ lobby_id: lobbyId, user_id: userId, is_host: false, color })

  if (error) displayError(error)
  else {
    myLobbyId.value = lobbyId
    await loadMembers(lobbyId)
    await refreshLobbies()
  }

  joining.value = null
}

const startLobby = async () => {
  const userId = await getUserId()
  if (!userId || !currentLobby.value || !isHost.value) return
  try {
    const { gameId } = await authFetch<{ gameId: string }>(`/api/lobbies/${currentLobby.value.id}/start`, {
      method: 'POST'
    })
    if (gameId) {
      navigateTo(`/game?gameId=${gameId}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t('lobby.error')
    displayError({ message })
  }
}

const displayError = (error: { message: string }) => {
  console.error(error.message)
}

const subscribeRealtime = () => {
  channel = supabase
    .channel('lobby-stream')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lobbies' }, () => refreshLobbies())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_players' }, async () => {
      await loadMembers(myLobbyId.value!)
      refreshLobbies()
    })
    .subscribe()
}

onMounted(async () => {
  subscribeRealtime()
  const uid = await getUserId()
  if (uid) await refreshLobbies()
})

watch(() => user.value?.id, async (id) => {
  if (id) {
    userIdRef.value = id
    await refreshLobbies()
  }
})

onUnmounted(() => {
  if (channel) supabase.removeChannel(channel)
})

watch(currentLobby, (value) => {
  if (value?.status === 'started' && value.game_id) navigateTo(`/game?gameId=${value.game_id}`)
})
</script>

<template>
  <div class="bg-static-nasa text-white min-h-screen">
    <div class="bg-linear-to-b from-neutral-900/85 via-neutral-950/90 to-neutral-950/80 min-h-screen">
      <UContainer class="py-8 space-y-8">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-4xl font-bold text-white">
              {{ t('lobby.title') }}
            </h1>
          </div>
          <div class="flex gap-2">
            <CommonLanguageSwitch />
            <UButton
              icon="i-lucide-image"
              to="/credits"
              variant="soft"
              color="neutral"
            >
              {{ t('lobby.credits-button') }}
            </UButton>
            <UButton
              icon="i-lucide-user"
              to="/profile"
              variant="soft"
            >
              {{ t('lobby.profile-button') }}
            </UButton>
            <UButton
              icon="i-lucide-log-out"
              color="neutral"
              variant="soft"
              @click="signOut"
            >
              {{ t('lobby.logout-button') }}
            </UButton>
          </div>
        </div>

        <!-- Your Lobby -->
        <div
          v-if="currentLobby"
          class="space-y-6"
        >
          <UCard class="border-white/10 bg-white/5">
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h2 class="text-2xl font-bold text-white">
                    {{ currentLobby.name }}
                  </h2>
                  <p class="text-sm text-neutral-400 mt-1">
                    {{ t('lobby.host-label') }} <span class="text-primary-400">{{ hostNameFor(currentLobby.host_id) }}</span>
                  </p>
                </div>
                <UBadge
                  :color="currentLobby.status === 'started' ? 'warning' : 'success'"
                  variant="subtle"
                  class="text-xs uppercase"
                >
                  {{ currentLobby.status === 'started' ? t('lobby.status-started') : t('lobby.status-waiting') }}
                </UBadge>
              </div>
            </template>

            <div class="grid gap-8 lg:grid-cols-3 pb-4">
              <!-- Players -->
              <div class="lg:col-span-2 space-y-4">
                <div>
                  <p class="text-sm font-semibold text-white uppercase tracking-wide mb-3">
                    👥 {{ t('lobby.players-title') }} ({{ memberCount }})
                  </p>
                  <div class="space-y-2">
                    <div
                      v-for="player in members"
                      :key="player.user_id"
                      class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <div class="flex items-center gap-3">
                        <span
                          class="h-3 w-3 rounded-full ring-1 ring-white/30"
                          :style="{ backgroundColor: player.color || unclaimedColor }"
                          :title="player.color ? '' : t('lobby.color-unset')"
                        />
                        <span>{{ player.profiles?.username || t('lobby.commander') }}</span>
                      </div>
                      <span
                        v-if="player.is_host"
                        class="text-xs uppercase text-primary-300 bg-primary-500/20 px-2 py-1 rounded"
                      >{{ t('lobby.host-badge') }}</span>
                    </div>
                    <p
                      v-if="!members.length"
                      class="text-sm text-neutral-400 text-center py-4"
                    >
                      {{ t('lobby.waiting-for-players') }}
                    </p>
                  </div>
                </div>

                <!-- Colour picker -->
                <div>
                  <p class="text-sm font-semibold text-white uppercase tracking-wide mb-3">
                    🎨 {{ t('lobby.color-title') }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="color in colorOptions"
                      :key="color"
                      type="button"
                      :disabled="!!colorTakenBy(color)"
                      :title="colorTakenBy(color) ? colorTakenBy(color)?.profiles?.username || '' : ''"
                      :data-testid="`color-swatch-${color}`"
                      class="h-8 w-8 rounded-full ring-2 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      :class="myColor === color ? 'ring-white scale-110' : 'ring-white/20 hover:ring-white/60'"
                      :style="{ backgroundColor: color }"
                      @click="chooseColor(color)"
                    />
                  </div>
                  <p
                    v-if="!myColor"
                    class="text-xs text-neutral-400 mt-2"
                  >
                    {{ t('lobby.color-hint') }}
                  </p>
                </div>
              </div>

              <!-- Info -->
              <div class="space-y-3 text-sm">
                <div>
                  <p class="text-neutral-400 text-xs uppercase tracking-wide">
                    {{ t('lobby.player-limit-label') }}
                  </p>
                  <p class="text-lg font-semibold text-white">
                    {{ memberCount }}{{ t('lobby.player-limit-max') }}
                  </p>
                </div>
                <div class="pt-3 border-t border-white/5">
                  <p class="text-neutral-400 text-xs uppercase tracking-wide">
                    {{ t('lobby.lobby-id-label') }}
                  </p>
                  <p class="text-neutral-300 font-mono text-xs break-all mt-1">
                    {{ currentLobby.id }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-wrap gap-2 pt-6 border-t border-white/5">
              <UButton
                v-if="isHost"
                color="primary"
                icon="i-lucide-rocket"
                :disabled="memberCount < 1"
                data-testid="start-game-button"
                @click="startLobby"
              >
                {{ t('lobby.start-game-button') }}
              </UButton>
              <UButton
                v-else
                color="primary"
                variant="soft"
                icon="i-lucide-hourglass"
                disabled
              >
                {{ t('lobby.waiting-for-host-button') }}
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-log-out"
                data-testid="leave-lobby-button"
                @click="leaveCurrentLobby"
              >
                {{ t('lobby.leave-lobby-button') }}
              </UButton>
            </div>
          </UCard>
        </div>

        <!-- Open Lobbies -->
        <div
          v-else
          class="space-y-6"
        >
          <div class="grid gap-6 lg:grid-cols-3">
            <!-- Lobbies List -->
            <div class="lg:col-span-2">
              <UCard class="border-white/10 bg-white/5">
                <template #header>
                  <div class="flex items-center justify-between">
                    <h2 class="text-lg font-bold text-white">
                      {{ t('lobby.open-lobbies-title') }}
                    </h2>
                    <span class="text-xs text-neutral-300">{{ lobbies.length }} {{ t('lobby.active-count') }}</span>
                  </div>
                </template>

                <div
                  v-if="loading"
                  class="space-y-3"
                >
                  <USkeleton
                    v-for="i in 4"
                    :key="i"
                    class="h-16"
                  />
                </div>

                <div
                  v-else-if="lobbies.length"
                  class="space-y-3"
                >
                  <div
                    v-for="lobby in lobbies"
                    :key="lobby.id"
                    data-testid="lobby-row"
                    :data-lobby-name="lobby.name"
                    class="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 p-4 md:flex-row md:items-center md:justify-between transition-colors"
                  >
                    <div class="space-y-2 flex-1">
                      <div class="flex items-center gap-2">
                        <span
                          class="h-2 w-2 rounded-full"
                          :class="lobby.status === 'started' ? 'bg-warning-400' : 'bg-success-400'"
                        />
                        <span
                          class="text-xs uppercase tracking-wide font-semibold"
                          :class="lobby.status === 'started' ? 'text-warning-300' : 'text-success-300'"
                        >
                          {{ lobby.status === 'started' ? t('lobby.lobby-started') : t('lobby.lobby-ready') }}
                        </span>
                      </div>
                      <p class="font-semibold text-white">
                        {{ lobby.name }}
                      </p>
                      <p class="text-sm text-neutral-300">
                        {{ hostNameFor(lobby.host_id) }} · {{ playerCounts[lobby.id] || 0 }}{{ t('lobby.player-limit-max') }}
                      </p>
                    </div>
                    <UButton
                      :disabled="lobby.status === 'started'"
                      :loading="joining === lobby.id"
                      icon="i-lucide-door-open"
                      size="sm"
                      data-testid="join-lobby-button"
                      @click="joinLobby(lobby.id)"
                    >
                      {{ t('lobby.join-button') }}
                    </UButton>
                  </div>
                </div>

                <div
                  v-else
                  class="text-center py-6 text-neutral-400"
                >
                  <p class="text-sm">
                    {{ t('lobby.no-lobbies') }}
                  </p>
                  <p class="text-xs text-neutral-500 mt-1">
                    {{ t('lobby.no-lobbies-hint') }}
                  </p>
                </div>
              </UCard>
            </div>

            <!-- Create Lobby -->
            <UCard class="border-white/10 bg-white/5 h-fit">
              <template #header>
                <p class="font-bold text-white">
                  {{ t('lobby.create-lobby-title') }}
                </p>
              </template>
              <div class="space-y-4">
                <UInput
                  v-model="lobbyName"
                  data-testid="lobby-name-input"
                  :placeholder="t('lobby.lobby-name-placeholder')"
                />
                <UButton
                  block
                  color="primary"
                  icon="i-lucide-rocket"
                  :loading="creating"
                  data-testid="create-lobby-button"
                  @click="createLobby"
                >
                  {{ t('lobby.create-button') }}
                </UButton>
              </div>
            </UCard>
          </div>
        </div>
      </UContainer>
    </div>
  </div>
</template>

<script setup lang="ts">
// Local UI type for resources display
interface GameResource {
  key: string
  label: string
  amount: number
  delta: string
  accent: string
  icon: string
  breakdown?: Array<{ planetName: string, total: number, sources: Array<{ label: string, amount: number }> }>
}

const props = defineProps<{
  year: number
  animateYear?: boolean
  unreadEventCount: number
  resources: Array<GameResource>
  research?: { id: string, roundsLeft: number, progress: number, pointsPerTurn: number }
  researchPointsPerTurn: number
  players: Array<{ id: string, name: string, ready: boolean, isCurrentPlayer: boolean }>
  planetActionCount: number
}>()

const emit = defineEmits<{
  (e: 'toggle-event-log' | 'open-research' | 'open-planet-overview'): void
}>()

const { locale, t, te } = useI18n()

const otherPlayers = computed(() => props.players
  .filter(player => !player.isCurrentPlayer))

const isFullscreen = ref(false)

const getResearchName = (id: string) => {
  const key = `game.research.techs.${id.replace('tech:', '')}.name`
  if (te(key)) return t(key)
  const legacyKey = `game.research.options.${id}.name`
  if (te(legacyKey)) return t(legacyKey)
  return id
}

const updateFullscreenState = () => {
  if (typeof document === 'undefined') return
  isFullscreen.value = Boolean(document.fullscreenElement)
}

const toggleFullscreen = async () => {
  if (typeof document === 'undefined') return
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }
  await document.documentElement.requestFullscreen()
}

onMounted(() => {
  updateFullscreenState()
  document.addEventListener('fullscreenchange', updateFullscreenState)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', updateFullscreenState)
})
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
    <div class="flex items-center justify-between px-4 py-2 gap-4">
      <!-- Left Section: Resources & Progress -->
      <div class="flex items-center gap-3 flex-1">
        <div
          v-for="resource in props.resources"
          :key="resource.key"
          :data-testid="`resource-pill-${resource.key}`"
          class="group relative flex items-center gap-2 h-9.5 px-3 rounded-md bg-neutral-900/60 border border-neutral-800 cursor-help"
        >
          <UIcon
            :name="`i-lucide-${resource.icon}`"
            class="text-sm"
            :class="resource.accent"
          />
          <span class="font-mono text-sm text-neutral-200">
            {{ resource.amount.toLocaleString(locale) }}
          </span>
          <span
            class="text-xs"
            :class="resource.delta.startsWith('+') ? 'text-success-400' : 'text-critical-400'"
          >
            {{ resource.delta }}
          </span>

          <!-- Production breakdown (where does this resource come from?) -->
          <div
            :data-testid="`resource-breakdown-${resource.key}`"
            class="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden min-w-48 rounded-md border border-neutral-700 bg-neutral-950/95 p-2 text-xs shadow-xl group-hover:block"
          >
            <p class="mb-1 flex items-center gap-1.5 font-semibold text-neutral-200">
              <UIcon
                :name="`i-lucide-${resource.icon}`"
                :class="resource.accent"
              />
              {{ resource.label }}
              <span
                class="ml-auto"
                :class="resource.delta.startsWith('+') ? 'text-success-400' : 'text-critical-400'"
              >{{ resource.delta }}{{ $t('game.top-bar.per-turn') }}</span>
            </p>
            <div
              v-if="resource.breakdown?.length"
              class="space-y-1.5"
            >
              <div
                v-for="group in resource.breakdown"
                :key="group.planetName"
              >
                <p class="flex justify-between gap-4 font-medium text-neutral-200">
                  <span>{{ group.planetName }}</span>
                  <span class="font-mono text-success-400">+{{ group.total }}</span>
                </p>
                <ul class="space-y-0.5 pl-2">
                  <li
                    v-for="src in group.sources"
                    :key="src.label"
                    class="flex justify-between gap-4 text-neutral-400"
                  >
                    <span>{{ src.label }}</span>
                    <span class="font-mono text-success-400/80">+{{ src.amount }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <p
              v-else
              class="text-neutral-500"
            >
              {{ $t('game.top-bar.no-production') }}
            </p>
          </div>
        </div>
        <!-- Research Section -->
        <UButton
          variant="ghost"
          color="neutral"
          data-testid="research-button"
          class="relative flex items-center gap-3 h-9.5 px-4 rounded-md bg-neutral-900/60 border border-neutral-800 hover:border-info-500 transition-colors cursor-pointer shrink-0 min-w-100"
          @click="emit('open-research')"
        >
          <!-- Progress bar background -->
          <div
            class="absolute inset-0 bg-info-500/20 rounded-md transition-all duration-500"
            :style="{ width: (props.research?.progress ?? 0) + '%' }"
          />
          <div class="relative flex items-center z-10 text-info-400 gap-2">
            <UIcon
              name="i-lucide-flask-conical"
              class=""
            />
            <span class="text-xs">+{{ props.researchPointsPerTurn }}</span>
          </div>

          <span class="relative z-10 text-sm font-medium text-info-200">
            {{ props.research
              ? getResearchName(props.research.id)
              : $t('game.research.none-short') }}
          </span>
          <div class="relative z-10 ml-auto flex items-center gap-2">
            <UIcon
              name="i-lucide-clock"
              class="text-xs text-neutral-500"
            />
            <span class="text-xs text-neutral-400">{{ props.research?.roundsLeft ?? 0 }}</span>
          </div>
        </UButton>
        <GameTopBarIconButton
          icon="i-lucide-earth"
          data-testid="planet-overview-button"
          :label="$t('game.planet.overview.aria')"
          :badge-count="props.planetActionCount"
          badge-color="warning"
          @click="emit('open-planet-overview')"
        />
      </div>

      <!-- Right Section: Game Info & Actions -->
      <div class="flex items-center gap-3 shrink-0">
        <UAvatarGroup
          v-if="otherPlayers.length"
          size="md"
          class="topbar-avatars"
        >
          <UChip
            v-for="player in otherPlayers"
            :key="player.id"
            :color="player.ready ? 'success' : 'warning'"
            size="sm"
            inset
          >
            <UAvatar
              size="md"
              :alt="player.name"
              :text="player.name?.slice(0, 2).toUpperCase()"
            />
          </UChip>
        </UAvatarGroup>
        <GameTopBarIconButton
          icon="i-lucide-bell"
          data-testid="event-log-button"
          :label="$t('game.event-log.title')"
          :badge-count="props.unreadEventCount"
          badge-color="primary"
          @click="emit('toggle-event-log')"
        />
        <div class="year-frame year-frame--muted">
          <Transition
            name="year-shift"
            mode="out-in"
          >
            <span
              :key="props.year"
              data-testid="year-display"
              class="year-display year-display--muted"
              :class="{ 'year-pulse': props.animateYear }"
            >
              {{ props.year }}
            </span>
          </Transition>
          <span class="year-era">{{ $t('game.top-bar.era') }}</span>
          <span
            class="year-scan year-scan--muted"
            aria-hidden="true"
          />
        </div>
        <UButton
          class="relative! inline-flex items-center justify-center w-9.5! h-9.5! min-w-9.5! p-0! rounded-xl border border-slate-400/18 bg-slate-900/70 shadow-[inset_0_0_16px_rgba(59,130,246,0.12),0_0_12px_rgba(59,130,246,0.12)] hover:border-indigo-400/45 hover:shadow-[inset_0_0_16px_rgba(59,130,246,0.2),0_0_14px_rgba(59,130,246,0.25)] transition-all cursor-pointer"
          type="button"
          variant="ghost"
          color="neutral"
          :aria-label="isFullscreen ? $t('game.top-bar.fullscreen-exit') : $t('game.top-bar.fullscreen-enter')"
          @click="toggleFullscreen"
        >
          <UIcon
            :name="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            class="text-base text-indigo-200"
          />
        </UButton>
        <CommonLanguageSwitch />
      </div>
    </div>
  </header>
</template>

<style scoped>
.year-frame {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(2, 6, 23, 0.6));
  box-shadow: inset 0 0 18px rgba(59, 130, 246, 0.12), 0 0 16px rgba(59, 130, 246, 0.12);
  overflow: hidden;
  justify-content: flex-start;
  gap: 8px;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.year-frame--muted {
  border-color: rgba(100, 116, 139, 0.25);
  box-shadow: inset 0 0 12px rgba(59, 130, 246, 0.08), 0 0 10px rgba(59, 130, 246, 0.08);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(2, 6, 23, 0.5));
}

.year-frame:hover {
  border-color: rgba(129, 140, 248, 0.45);
  box-shadow: inset 0 0 18px rgba(59, 130, 246, 0.18), 0 0 18px rgba(59, 130, 246, 0.25);
}

.year-display {
  font-size: 2rem;
  letter-spacing: 0.32em;
  color: #e0f2fe;
  text-shadow: 0 0 26px rgba(59, 130, 246, 0.45), 0 0 8px rgba(191, 219, 254, 0.35);
  min-width: 3.5rem;
}

.year-display--muted {
  font-size: 1.4rem;
  letter-spacing: 0.26em;
  color: rgba(226, 232, 240, 0.75);
  text-shadow: 0 0 14px rgba(59, 130, 246, 0.18);
}

.year-era {
  margin-left: 2px;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.6);
  text-shadow: 0 0 8px rgba(59, 130, 246, 0.25);
}

.topbar-avatars {
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.year-scan {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent, rgba(59, 130, 246, 0.08), transparent);
  opacity: 0.6;
  animation: scanline 4s ease-in-out infinite;
}

.year-scan--muted {
  opacity: 0.35;
}

.year-pulse {
  animation: yearPulse 0.9s ease-out;
}

.year-shift-enter-active,
.year-shift-leave-active {
  transition: all 0.35s ease;
}

.year-shift-enter-from {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

.year-shift-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(1.01);
}

@keyframes yearPulse {
  0% {
    text-shadow: 0 0 8px rgba(59, 130, 246, 0.25);
    filter: brightness(1);
  }
  50% {
    text-shadow: 0 0 30px rgba(59, 130, 246, 0.75), 0 0 12px rgba(191, 219, 254, 0.7);
    filter: brightness(1.2);
  }
  100% {
    text-shadow: 0 0 26px rgba(59, 130, 246, 0.45), 0 0 8px rgba(191, 219, 254, 0.35);
    filter: brightness(1);
  }
}

@keyframes scanline {
  0% {
    transform: translateY(-100%);
  }
  50% {
    transform: translateY(100%);
  }
  100% {
    transform: translateY(-100%);
  }
}
</style>

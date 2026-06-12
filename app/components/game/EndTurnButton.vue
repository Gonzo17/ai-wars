<script setup lang="ts">
type ButtonState = 'action-required' | 'ready' | 'waiting' | 'needs-production' | 'needs-research'

const props = defineProps<{
  state: ButtonState
  players: Array<{ id: string, name: string, ready: boolean, isCurrentPlayer: boolean }>
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: []
  unsubmit: []
  openProduction: []
  openResearch: []
}>()

const isWaiting = computed(() => props.state === 'waiting')
const isActionRequired = computed(() => props.state === 'action-required')
const isReady = computed(() => props.state === 'ready')
const isProductionRequired = computed(() => props.state === 'needs-production')
const isResearchRequired = computed(() => props.state === 'needs-research')

const handleClick = () => {
  if (props.disabled) return
  if (props.state === 'needs-production') {
    emit('openProduction')
    return
  }
  if (props.state === 'needs-research') {
    emit('openResearch')
    return
  }
  if (props.state === 'ready') emit('submit')
  if (props.state === 'waiting') emit('unsubmit')
}
const labelKey = computed(() => {
  switch (props.state) {
    case 'waiting': return 'game.end-turn.waiting'
    case 'needs-production': return 'game.end-turn.needs-production'
    case 'needs-research': return 'game.end-turn.needs-research'
    case 'ready': return 'game.end-turn.ready'
    default: return 'game.end-turn.action-required'
  }
})
</script>

<template>
  <div class="fixed bottom-10 right-10 z-30">
    <!-- Label above button -->
    <div
      class="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full backdrop-blur-md border transition-all duration-300"
      :class="{
        'bg-neutral-900/70 text-neutral-300 border-neutral-500/40 shadow-[0_0_12px_rgba(148,163,184,0.2)]': isWaiting,
        'bg-info-950/70 text-info-200 border-info-400/40 shadow-[0_0_12px_rgba(34,211,238,0.25)]': isActionRequired || isResearchRequired,
        'bg-warning-950/70 text-warning-200 border-warning-400/40 shadow-[0_0_12px_rgba(245,158,11,0.3)]': isProductionRequired,
        'bg-primary-950/70 text-primary-200 border-primary-400/40 shadow-[0_0_12px_rgba(139,92,246,0.25)]': isReady
      }"
    >
      {{ $t(labelKey) }}
    </div>

    <!-- Backdrop for button visibility -->
    <div
      class="absolute -inset-8 rounded-full bg-black/60 blur-lg"
      aria-hidden="true"
    />

    <!-- Main Button Container - this is the anchor -->
    <div class="relative w-24 h-24">
      <!-- Outer glow ring - always visible -->
      <div
        class="absolute -inset-2 rounded-full opacity-60 blur-md transition-all duration-500"
        :class="{
          'bg-neutral-500/40': isWaiting,
          'bg-info-500/50': isActionRequired || isResearchRequired,
          'bg-warning-500/55': isProductionRequired,
          'bg-primary-500/50': isReady
        }"
      />

      <!-- Rotating orbital ring -->
      <div
        class="absolute -inset-3 rounded-full border transition-colors duration-300 animate-[spin_8s_linear_infinite]"
        :class="{
          'border-neutral-400/30': isWaiting,
          'border-info-400/30': isActionRequired || isResearchRequired,
          'border-warning-400/40': isProductionRequired,
          'border-primary-400/30': isReady
        }"
      >
        <div
          class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-colors duration-300"
          :class="{
            'bg-neutral-400': isWaiting,
            'bg-info-400': isActionRequired || isResearchRequired,
            'bg-warning-400': isProductionRequired,
            'bg-primary-400': isReady
          }"
        />
      </div>

      <!-- Second orbital ring (counter-rotation) -->
      <div
        class="absolute -inset-5 rounded-full border animate-[spin_12s_linear_infinite_reverse] transition-colors duration-300"
        :class="{
          'border-neutral-400/20': isWaiting,
          'border-info-400/20': isActionRequired || isResearchRequired,
          'border-warning-400/25': isProductionRequired,
          'border-primary-400/20': isReady
        }"
      >
        <div
          class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1.5 h-1.5 rounded-full transition-colors duration-300"
          :class="{
            'bg-neutral-300': isWaiting,
            'bg-info-300': isActionRequired || isResearchRequired,
            'bg-warning-300': isProductionRequired,
            'bg-primary-300': isReady
          }"
        />
      </div>

      <!-- Main Button -->
      <UButton
        variant="ghost"
        color="neutral"
        :padded="false"
        data-testid="end-turn-button"
        :data-state="state"
        class="group relative flex items-center justify-center w-24 h-24 rounded-full shadow-2xl transition-all duration-300 overflow-hidden hover:scale-105"
        :class="{
          'bg-linear-to-br from-neutral-400 via-neutral-500 to-neutral-600 text-neutral-950 hover:shadow-[0_0_40px_rgba(148,163,184,0.5)]': isWaiting,
          'bg-linear-to-br from-info-400 via-info-500 to-info-600 text-info-950 hover:shadow-[0_0_40px_rgba(34,211,238,0.5)]': isActionRequired || isResearchRequired,
          'bg-linear-to-br from-warning-400 via-warning-500 to-warning-600 text-warning-950 hover:shadow-[0_0_40px_rgba(245,158,11,0.5)]': isProductionRequired,
          'bg-linear-to-br from-primary-400 via-primary-500 to-primary-600 text-primary-950 hover:shadow-[0_0_40px_rgba(139,92,246,0.5)]': isReady
        }"
        @click="handleClick"
      >
        <!-- Inner glow effect -->
        <div class="absolute inset-0 rounded-full bg-linear-to-t from-transparent via-white/10 to-white/20" />

        <!-- Scan line effect -->
        <div class="absolute inset-0 rounded-full overflow-hidden">
          <div
            class="absolute inset-0 animate-[scan_2s_ease-in-out_infinite] transition-colors duration-300"
            :class="{
              'bg-linear-to-b from-transparent via-neutral-200/10 to-transparent': isWaiting,
              'bg-linear-to-b from-transparent via-info-200/10 to-transparent': isActionRequired || isResearchRequired,
              'bg-linear-to-b from-transparent via-warning-200/10 to-transparent': isProductionRequired,
              'bg-linear-to-b from-transparent via-primary-200/10 to-transparent': isReady
            }"
          />
        </div>

        <!-- Icon -->
        <UIcon
          :name="isWaiting
            ? 'i-lucide-loader-circle'
            : isProductionRequired
              ? 'i-lucide-hammer'
              : isResearchRequired
                ? 'i-lucide-flask-conical'
                : isActionRequired
                  ? 'i-lucide-clipboard-list'
                  : 'i-lucide-play'"
          class="relative z-10 drop-shadow-lg text-4xl"
          :class="{ 'animate-spin': isWaiting }"
        />
      </UButton>
    </div>
  </div>
</template>

<style scoped>
@keyframes scan {
  0%, 100% {
    transform: translateY(-100%);
  }
  50% {
    transform: translateY(100%);
  }
}
</style>

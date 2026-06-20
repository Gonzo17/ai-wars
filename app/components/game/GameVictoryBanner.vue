<script setup lang="ts">
const props = defineProps<{
  countdown: {
    isMine: boolean
    playerName: string
    /** Victory condition key (military | expansion | research). */
    condition: string
    turns: number
    color: string
  }
}>()

const { t } = useI18n()

const conditionLabel = computed(() => t(`game.victory.condition.${props.countdown.condition}`))

const message = computed(() =>
  props.countdown.isMine
    ? t('game.victory.countdown-you', { condition: conditionLabel.value, turns: props.countdown.turns })
    : t('game.victory.countdown-rival', { name: props.countdown.playerName, condition: conditionLabel.value, turns: props.countdown.turns })
)
</script>

<template>
  <div
    data-testid="victory-banner"
    class="relative z-20 flex items-center justify-center gap-3 border-b px-4 py-2 text-sm font-semibold tracking-wide animate-pulse"
    :class="countdown.isMine ? 'bg-success-950/70 text-success-200' : 'bg-critical-950/70 text-critical-100'"
    :style="{ borderColor: countdown.color, boxShadow: `inset 0 0 24px ${countdown.color}33` }"
  >
    <UIcon
      name="i-lucide-trophy"
      class="h-4 w-4 shrink-0"
      :style="{ color: countdown.color }"
    />
    <span>{{ message }}</span>
  </div>
</template>

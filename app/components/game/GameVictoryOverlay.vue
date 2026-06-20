<script setup lang="ts">
const props = defineProps<{
  result: {
    isMine: boolean
    winnerName: string
    /** Victory condition key (military | expansion | research). */
    condition: string
    color: string
  }
}>()

const emit = defineEmits<{ (e: 'home'): void }>()

const { t } = useI18n()

const conditionLabel = computed(() => t(`game.victory.condition.${props.result.condition}`))
const title = computed(() => (props.result.isMine ? t('game.victory.over-win') : t('game.victory.over-lose')))
const subtitle = computed(() =>
  t('game.victory.over-subtitle', { name: props.result.winnerName, condition: conditionLabel.value }))
</script>

<template>
  <div
    data-testid="victory-overlay"
    class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 backdrop-blur-sm"
  >
    <div
      class="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border bg-neutral-900/95 px-10 py-12 text-center shadow-2xl"
      :style="{ borderColor: result.color, boxShadow: `0 0 60px ${result.color}44` }"
    >
      <div
        class="flex h-20 w-20 items-center justify-center rounded-full"
        :style="{ backgroundColor: `${result.color}22`, boxShadow: `0 0 30px ${result.color}55` }"
      >
        <UIcon
          name="i-lucide-trophy"
          class="h-10 w-10"
          :style="{ color: result.color }"
        />
      </div>

      <div class="space-y-2">
        <h2
          class="text-3xl font-bold tracking-tight"
          :class="result.isMine ? 'text-success-300' : 'text-critical-300'"
        >
          {{ title }}
        </h2>
        <p class="text-neutral-300">
          {{ subtitle }}
        </p>
      </div>

      <UButton
        data-testid="victory-overlay-home"
        color="primary"
        size="lg"
        icon="i-lucide-arrow-left"
        @click="emit('home')"
      >
        {{ t('game.victory.back-home') }}
      </UButton>
    </div>
  </div>
</template>

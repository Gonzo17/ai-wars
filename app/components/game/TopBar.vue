<script setup lang="ts">
const props = defineProps<{
  year: number
  unreadEventCount: number
}>()

const emit = defineEmits<{
  (e: 'end-year' | 'toggle-event-log'): void
}>()

const { locales, setLocale, localeProperties } = useI18n()

const items = computed(() =>
  locales.value.map(l => ({
    label: l.name ?? l.code.toUpperCase(),
    code: l.code,
    onSelect: async () => {
      setLocale(l.code)
    }
  }))
)
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
    <div class="flex items-center justify-between px-6 py-3">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <UBadge
            color="primary"
            variant="solid"
            class="uppercase tracking-[0.2em] bg-cyan-500 text-slate-950"
          >
            AI Wars
          </UBadge>
        </div>
        <UDropdownMenu :items="items">
          <UButton
            variant="ghost"
            size="sm"
            :label="localeProperties.name"
          />
        </UDropdownMenu>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-sm text-slate-400">{{ $t('game.top-bar.year', { value: props.year }) }}</span>
        <span class="text-sm text-slate-400">{{ $t('game.top-bar.players', { count: 3 }) }}</span>
        <span class="text-sm text-slate-400">{{ $t('game.top-bar.timer', { value: '47s' }) }}</span>
      </div>
      <div class="flex items-center gap-3">
        <GameEventLogButton
          :unread-count="props.unreadEventCount"
          @click="emit('toggle-event-log')"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-skip-forward"
          size="sm"
          @click="emit('end-year')"
        >
          {{ $t('game.top-bar.end-year') }}
        </UButton>
      </div>
    </div>
  </header>
</template>

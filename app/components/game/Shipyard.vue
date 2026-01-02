<script setup lang="ts">
const props = defineProps<{
  open: boolean
  planet: string
}>()

const { t } = useI18n()

const shipyardOptions = computed(() => ([
  {
    id: 'frigate',
    name: t('game.shipyard.options.frigate.name'),
    cost: t('game.shipyard.options.frigate.cost'),
    time: t('game.shipyard.options.frigate.time'),
    description: t('game.shipyard.options.frigate.description')
  },
  {
    id: 'carrier',
    name: t('game.shipyard.options.carrier.name'),
    cost: t('game.shipyard.options.carrier.cost'),
    time: t('game.shipyard.options.carrier.time'),
    description: t('game.shipyard.options.carrier.description')
  },
  {
    id: 'probe',
    name: t('game.shipyard.options.probe.name'),
    cost: t('game.shipyard.options.probe.cost'),
    time: t('game.shipyard.options.probe.time'),
    description: t('game.shipyard.options.probe.description')
  }
]))
</script>

<template>
  <div>
    <p class="text-sm uppercase tracking-[0.2em] text-slate-400">
      {{ $t('game.shipyard.title') }}
    </p>
    <p class="text-lg font-semibold text-slate-100">
      {{ props.planet || $t('game.shipyard.planet-placeholder') }}
    </p>
  </div>

  <div class="space-y-3">
    <UCard
      v-for="item in shipyardOptions"
      :key="item.id"
      color="neutral"
      variant="soft"
      class="border border-slate-800 bg-slate-900/80"
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="font-semibold text-slate-100">
            {{ item.name }}
          </p>
          <p class="text-xs text-slate-400">
            {{ item.description }}
          </p>
        </div>
        <div class="text-right text-xs text-slate-400">
          <p>{{ item.cost }}</p>
          <p>{{ item.time }}</p>
        </div>
      </div>
    </UCard>
  </div>

  <div class="flex gap-2">
    <UButton
      color="neutral"
      variant="soft"
      block
    >
      {{ $t('game.shipyard.cancel') }}
    </UButton>
    <UButton
      color="primary"
      variant="solid"
      block
    >
      {{ $t('game.shipyard.launch') }}
    </UButton>
  </div>
</template>

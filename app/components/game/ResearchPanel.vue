<script setup lang="ts">
const { t } = useI18n()

const researchOptions = computed(() => ([
  {
    id: 'quantum-lattice',
    name: t('game.research.options.quantum-lattice.name'),
    time: 2,
    bonus: t('game.research.options.quantum-lattice.bonus')
  },
  {
    id: 'stellar-forges',
    name: t('game.research.options.stellar-forges.name'),
    time: 3,
    bonus: t('game.research.options.stellar-forges.bonus')
  },
  {
    id: 'ai-commander',
    name: t('game.research.options.ai-commander.name'),
    time: 1,
    bonus: t('game.research.options.ai-commander.bonus')
  }
]))

const selected = ref(researchOptions.value[0]?.id ?? '')

const radioOptions = computed(() => researchOptions.value.map(item => ({ value: item.id, label: item.name, description: `${item.bonus} · ${t('game.common.duration-years', { count: item.time })}` })))
</script>

<template>
  <div class="space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-slate-400">
          {{ $t('game.research.panel.heading') }}
        </p>
        <p class="text-lg font-semibold text-violet-200">
          {{ $t('game.research.panel.subheading') }}
        </p>
      </div>
      <UBadge
        color="primary"
        variant="soft"
        size="xs"
      >
        {{ $t('game.research.panel.none') }}
      </UBadge>
    </header>

    <URadioGroup
      v-model="selected"
      :items="radioOptions"
      variant="table"
      indicator="hidden"
      class="space-y-2"
    />

    <div class="flex gap-2">
      <UButton
        block
        color="primary"
        variant="solid"
      >
        {{ $t('game.research.panel.confirm') }}
      </UButton>
    </div>
  </div>
</template>

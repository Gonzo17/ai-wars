<script setup lang="ts">
const props = defineProps<{
  open: boolean
  planet: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useI18n()

const buildOptions = computed(() => ([
  {
    id: 'hab',
    name: t('game.build.options.hab.name'),
    cost: t('game.build.options.hab.cost'),
    time: t('game.build.options.hab.time'),
    description: t('game.build.options.hab.description')
  },
  {
    id: 'lab',
    name: t('game.build.options.lab.name'),
    cost: t('game.build.options.lab.cost'),
    time: t('game.build.options.lab.time'),
    description: t('game.build.options.lab.description')
  },
  {
    id: 'shield',
    name: t('game.build.options.shield.name'),
    cost: t('game.build.options.shield.cost'),
    time: t('game.build.options.shield.time'),
    description: t('game.build.options.shield.description')
  }
]))
</script>

<template>
  <USlideover
    :model-value="props.open"
    side="right"
    @update:model-value="(val: boolean) => emit('update:open', val)"
  >
    <template #header>
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-slate-400">
          {{ $t('game.build.title') }}
        </p>
        <p class="text-lg font-semibold text-cyan-200">
          {{ props.planet || $t('game.build.planet-placeholder') }}
        </p>
      </div>
    </template>

    <div class="space-y-3">
      <UCard
        v-for="item in buildOptions"
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

    <template #footer>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="soft"
          block
          @click="emit('update:open', false)"
        >
          {{ $t('game.build.cancel') }}
        </UButton>
        <UButton
          color="primary"
          variant="solid"
          block
          @click="emit('confirm')"
        >
          {{ $t('game.build.confirm-queue') }}
        </UButton>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
defineProps<{
  selectionType: 'planet' | 'army' | 'system' | 'research' | null
  selection: GamePlanet | GameArmy | GameSolarSystem | null
}>()

const emit = defineEmits<{
  (e: 'update:view-mode', mode: 'galaxy' | 'system'): void
}>()
</script>

<template>
  <UCard
    color="neutral"
    variant="soft"
    class="border border-slate-800 bg-slate-900/80 backdrop-blur"
  >
    <div
      v-if="!selection && selectionType !== 'research'"
      class="py-4 text-sm text-slate-400"
    >
      {{ $t('game.selection.empty') }}
    </div>

    <div
      v-else-if="selection && selectionType === 'planet' && 'owner' in selection"
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="text-lg font-semibold text-cyan-200">
            {{ selection.name }}
          </p>
          <p class="text-xs text-slate-400">
            {{ selection.owner }} • {{ selection.type }}
          </p>
        </div>
        <UBadge
          color="primary"
          variant="soft"
          size="xs"
        >
          {{ $t('game.status.planet') }}
        </UBadge>
      </div>

      <div class="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
        <p class="text-xs uppercase tracking-wide text-slate-400">
          {{ $t('game.selection.buildings') }}
        </p>
        <div class="mt-1 flex flex-wrap gap-1">
          <UBadge
            v-for="item in selection.buildings"
            :key="item"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ item }}
          </UBadge>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p class="text-xs uppercase tracking-wide text-slate-400">
            {{ $t('game.selection.build-queue') }}
          </p>
          <p
            v-if="!selection.queues.build.length"
            class="text-sm text-slate-500"
          >
            {{ $t('game.selection.idle') }}
          </p>
          <ul
            v-else
            class="text-sm text-slate-200"
          >
            <li
              v-for="item in selection.queues.build"
              :key="item"
            >
              • {{ item }}
            </li>
          </ul>
        </div>
        <div class="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p class="text-xs uppercase tracking-wide text-slate-400">
            {{ $t('game.selection.shipyard') }}
          </p>
          <p
            v-if="!selection.queues.shipyard.length"
            class="text-sm text-slate-500"
          >
            {{ $t('game.selection.idle') }}
          </p>
          <ul
            v-else
            class="text-sm text-slate-200"
          >
            <li
              v-for="item in selection.queues.shipyard"
              :key="item"
            >
              • {{ item }}
            </li>
          </ul>
        </div>
      </div>

      <div class="flex gap-2">
        <UButton
          color="primary"
          variant="solid"
          icon="i-lucide-building-2"
          class="flex-1"
        >
          {{ $t('game.selection.build') }}
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-ship"
          class="flex-1"
        >
          {{ $t('game.selection.shipyard-action') }}
        </UButton>
      </div>
    </div>

    <div
      v-else-if="selection && selectionType === 'army' && 'strength' in selection"
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="text-lg font-semibold text-emerald-200">
            {{ selection.name }}
          </p>
          <p class="text-xs text-slate-400">
            {{ selection.location }}
          </p>
        </div>
        <UBadge
          :color="selection.status === 'idle' ? 'primary' : 'secondary'"
          variant="soft"
          size="xs"
        >
          {{ selection.status === 'idle' ? $t('game.selection.idle') : $t('game.selection.en-route', { eta: selection.eta ?? '' }) }}
        </UBadge>
      </div>

      <div class="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
        <div class="flex items-center justify-between text-sm text-slate-200">
          <span>{{ $t('game.selection.strength', { value: selection.strength }) }}</span>
        </div>
      </div>

      <div class="flex gap-2">
        <UButton
          color="primary"
          variant="solid"
          icon="i-lucide-navigation"
          class="flex-1"
        >
          {{ $t('game.selection.issue-move-order') }}
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-rocket"
          class="flex-1"
        >
          {{ $t('game.selection.reinforce') }}
        </UButton>
      </div>
    </div>

    <div
      v-else-if="selection && selectionType === 'system' && 'probeStatus' in selection"
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="text-lg font-semibold text-slate-100">
            {{ selection.name }}
          </p>
          <p class="text-xs text-slate-400">
            {{ $t('game.selection.probe') }}: {{ $t('game.systems.probe-status.' + selection.probeStatus) }} • {{ $t('game.selection.intel') }}: {{ $t('game.systems.intel.' + selection.intel) }}
          </p>
        </div>
        <UBadge
          color="neutral"
          variant="soft"
          size="xs"
        >
          {{ $t('game.status.system') }}
        </UBadge>
      </div>

      <div class="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
        <p class="text-xs uppercase tracking-wide text-slate-400">
          {{ $t('game.selection.connections') }}
        </p>
        <div class="mt-1 flex flex-wrap gap-1">
          <UBadge
            v-for="item in selection.connections"
            :key="item"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ item }}
          </UBadge>
        </div>
      </div>

      <UButton
        color="neutral"
        variant="solid"
        icon="i-lucide-expand"
        class="w-full"
        @click="emit('update:view-mode', 'system')"
      >
        {{ $t('game.selection.open-system-view') }}
      </UButton>
    </div>

    <div
      v-else-if="selectionType === 'research'"
      class="space-y-3"
    >
      <GameResearchPanel />
    </div>
  </UCard>
</template>

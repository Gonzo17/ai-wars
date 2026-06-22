<script setup lang="ts">
// A Civ-style build-list entry: the row shows only the name + build time; costs,
// description, yields and any "what's missing" hint live in a hover tooltip. The
// tooltip is teleported to <body> and positioned from the row's rect, so it can't
// be clipped by the catalog's scroll container (overflow-y:auto also clips x).
interface CostLine { icon: string, amount: number, ok: boolean }
interface YieldLine { icon: string, amount: number }

const props = defineProps<{
  testid: string
  name: string
  icon: string
  rounds: number
  disabled: boolean
  selected?: boolean
  accent?: 'primary' | 'sky' | 'amber'
  description?: string
  yields?: YieldLine[]
  costs?: CostLine[]
  /** Shown in the tooltip when the item can't be queued (resources/facility). */
  hint?: string | null
  /** Already built / building — show as completed (check) rather than dimmed-disabled. */
  done?: boolean
  /** Finished on this planet last turn — highlight with a "just completed" marker. */
  justCompleted?: boolean
}>()

const emit = defineEmits<{ select: [] }>()

const accent = computed(() => props.accent ?? 'primary')
const iconBg = computed(() => ({ primary: 'bg-neutral-800/80', sky: 'bg-sky-900/50', amber: 'bg-amber-900/40' }[accent.value]))
const iconText = computed(() => ({ primary: 'text-primary-200', sky: 'text-sky-200', amber: 'text-amber-200' }[accent.value]))
const selectedClass = computed(() => ({
  primary: 'border-primary-400/70 bg-primary-900/30',
  sky: 'border-sky-400/70 bg-sky-900/30',
  amber: 'border-amber-400/70 bg-amber-900/30'
}[accent.value]))

const rowEl = ref<HTMLElement | null>(null)
const tipOpen = ref(false)
const tipStyle = ref<Record<string, string>>({})

const TIP_WIDTH = 240
const TIP_EST_HEIGHT = 220

const openTip = () => {
  const el = rowEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  // Prefer to the right of the row; flip to the left if it would overflow.
  const left = r.right + 8 + TIP_WIDTH > window.innerWidth ? r.left - 8 - TIP_WIDTH : r.right + 8
  const top = Math.min(r.top, window.innerHeight - TIP_EST_HEIGHT - 8)
  tipStyle.value = { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }
  tipOpen.value = true
}
const closeTip = () => {
  tipOpen.value = false
}
</script>

<template>
  <button
    ref="rowEl"
    type="button"
    :data-testid="testid"
    class="group relative flex w-full items-center gap-3 rounded-md border px-2 py-2 text-left transition"
    :class="[
      done
        ? 'cursor-default border-success-700/30 bg-success-950/20'
        : selected ? selectedClass : 'border-transparent hover:bg-neutral-800/70',
      disabled && !done ? 'opacity-40 cursor-not-allowed' : ''
    ]"
    :disabled="disabled"
    @click="emit('select')"
    @mouseenter="openTip"
    @mouseleave="closeTip"
    @focus="openTip"
    @blur="closeTip"
  >
    <div
      class="relative flex h-7 w-7 items-center justify-center rounded-md shrink-0"
      :class="iconBg"
    >
      <UIcon
        :name="icon"
        class="h-4 w-4"
        :class="iconText"
      />
      <!-- Subtle "just completed last turn" marker, on the icon so it never hides the rounds. -->
      <span
        v-if="justCompleted"
        class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-success-400 ring-2 ring-neutral-950"
        :title="$t('game.slots.completed-last-turn')"
      />
    </div>
    <span
      class="flex-1 min-w-0 truncate text-sm font-medium"
      :class="done ? 'text-success-200/90' : 'text-neutral-100'"
    >
      {{ name }}
    </span>
    <!-- Built: a clear "done" chip (not a round count, so it never reads as buildable). -->
    <span
      v-if="done"
      class="flex shrink-0 items-center gap-1 rounded-full border border-success-700/40 bg-success-900/30 px-1.5 py-0.5 text-[10px] font-medium text-success-300"
    >
      <UIcon
        name="i-lucide-check"
        class="h-3 w-3"
      />{{ $t('game.slots.built-tag') }}
    </span>
    <!-- Repeatable / unbuilt items keep their round count. -->
    <span
      v-else
      class="shrink-0 text-[11px] text-neutral-400"
    >
      {{ $t('game.common.duration-rounds', { count: rounds }) }}
    </span>
    <UIcon
      v-if="hint && !done"
      name="i-lucide-circle-alert"
      class="h-3.5 w-3.5 shrink-0 text-warning-400"
    />
  </button>

  <Teleport to="body">
    <div
      v-if="tipOpen"
      :data-testid="`${testid}-tooltip`"
      class="pointer-events-none fixed z-[70] w-60 rounded-md border border-neutral-700 bg-neutral-950/95 p-3 text-xs shadow-xl"
      :style="tipStyle"
    >
      <p class="font-semibold text-neutral-100">
        {{ name }}
      </p>
      <p
        v-if="description"
        class="mt-1 text-neutral-400"
      >
        {{ description }}
      </p>

      <div
        v-if="yields && yields.length"
        class="mt-2"
      >
        <p class="text-[10px] uppercase tracking-wide text-neutral-500">
          {{ $t('game.slots.tooltip-effects') }}
        </p>
        <div class="mt-0.5 flex flex-wrap gap-2">
          <span
            v-for="(y, i) in yields"
            :key="i"
            class="flex items-center gap-0.5 text-success-300"
          ><UIcon
            :name="y.icon"
            class="h-3 w-3"
          />+{{ y.amount }}</span>
        </div>
      </div>

      <div class="mt-2">
        <p class="text-[10px] uppercase tracking-wide text-neutral-500">
          {{ $t('game.slots.tooltip-cost') }}
        </p>
        <div class="mt-0.5 flex flex-wrap items-center gap-2">
          <span
            v-for="(c, i) in costs"
            :key="i"
            class="flex items-center gap-0.5"
            :class="c.ok ? 'text-neutral-300' : 'text-critical-400'"
          ><UIcon
            :name="c.icon"
            class="h-3 w-3"
          />{{ c.amount }}</span>
          <span
            v-if="!costs || !costs.length"
            class="text-neutral-500"
          >{{ $t('game.slots.tooltip-free') }}</span>
          <span class="text-neutral-600">·</span>
          <span class="text-neutral-400">{{ $t('game.common.duration-rounds', { count: rounds }) }}</span>
        </div>
      </div>

      <p
        v-if="hint"
        class="mt-2 flex items-center gap-1 text-warning-300"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="h-3 w-3"
        />{{ hint }}
      </p>
    </div>
  </Teleport>
</template>

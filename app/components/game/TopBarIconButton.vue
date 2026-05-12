<script setup lang="ts">
defineProps<{
  icon: string
  label: string
  badgeCount?: number
  badgeColor?: 'primary' | 'warning' | 'error' | 'success' | 'info'
}>()

const emit = defineEmits<{
  click: []
}>()

const formatBadgeCount = (count: number) => count > 9 ? '9+' : count
</script>

<template>
  <UButton
    class="relative! inline-flex items-center justify-center w-9.5! h-9.5! min-w-9.5! p-0! rounded-xl border border-slate-400/18 bg-slate-900/70 shadow-[inset_0_0_16px_rgba(59,130,246,0.12),0_0_12px_rgba(59,130,246,0.12)] hover:border-indigo-400/45 hover:shadow-[inset_0_0_16px_rgba(59,130,246,0.2),0_0_14px_rgba(59,130,246,0.25)] transition-all cursor-pointer"
    type="button"
    variant="ghost"
    color="neutral"
    :aria-label="label"
    @click="emit('click')"
  >
    <UIcon
      :name="icon"
      class="text-base text-indigo-200"
    />
    <UBadge
      v-if="badgeCount && badgeCount > 0"
      size="xs"
      :color="badgeColor ?? 'primary'"
      variant="solid"
      class="absolute! -top-1.75 -right-1.75 min-w-5.5 h-5.5 px-1.5 rounded-full font-bold tracking-wide shadow-[0_0_10px_rgba(129,140,248,0.55)] inline-flex items-center justify-center"
    >
      {{ formatBadgeCount(badgeCount) }}
    </UBadge>
  </UButton>
</template>

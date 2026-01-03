<script setup lang="ts">
defineProps<{
  unreadCount: number
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()
</script>

<template>
  <div class="relative">
    <UButton
      icon="i-lucide-bell"
      color="neutral"
      variant="ghost"
      size="sm"
      @click="emit('click')"
    />

    <!-- Unread Badge -->
    <span
      v-if="unreadCount > 0"
      class="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-slate-950 bg-cyan-400 rounded-full"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>
  </div>
</template>

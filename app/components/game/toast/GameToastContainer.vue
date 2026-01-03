<script setup lang="ts">
const store = useEventLogStore()
</script>

<template>
  <div class="fixed bottom-6 left-6 z-50 flex flex-col-reverse gap-3">
    <TransitionGroup
      name="toast"
      tag="div"
      class="flex flex-col-reverse gap-3"
    >
      <GameToast
        v-for="toast in store.toasts"
        :key="toast.id"
        :toast="toast"
        @click="store.handleToastClick(toast.id)"
        @dismiss="store.dismissToast(toast.id)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.5, 0, 0.75, 0);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-100%) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.9);
}

.toast-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>

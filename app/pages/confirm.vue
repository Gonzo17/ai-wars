<script setup lang="ts">
const user = useSupabaseUser()

watch(user, () => {
  if (user.value) {
    return navigateTo('/lobby')
  }
}, { immediate: true })
</script>

<template>
  <div>{{ $t('auth.waiting-login') }}</div>
</template>

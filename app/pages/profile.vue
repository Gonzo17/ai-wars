<script setup lang="ts">
const { t } = useI18n()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const loading = ref(false)
const form = reactive({
  username: ''
})

const getUserId = async (): Promise<string | null> => {
  if (user.value?.id) return user.value.id
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

watchEffect(() => {
  if (user.value === null) navigateTo('/')
})

const loadProfile = async () => {
  const userId = await getUserId()
  if (!userId) {
    displayError({ message: t('profile.user-not-found') })
    return
  }

  loading.value = true
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle()

  if (error) displayError(error)
  form.username = data?.username || ''
  loading.value = false
}

const saveProfile = async () => {
  const userId = await getUserId()
  if (!userId) return
  loading.value = true

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, username: form.username.trim() || t('lobby.commander') })

  if (error) displayError(error)
  else {
    console.log('Profile updated successfully.')
  }

  loading.value = false
}

const displayError = (error: { message: string }) => {
  console.error(error.message)
}

onMounted(loadProfile)
</script>

<template>
  <div>
    <div class="bg-static-nasa text-white min-h-screen">
      <div class="bg-linear-to-b from-neutral-900/85 via-neutral-950/90 to-neutral-950/80 min-h-screen">
        <UContainer class="py-8">
          <div class="mb-8 space-y-2">
            <p class="text-sm uppercase tracking-[0.2em] text-primary-400 font-semibold">
              {{ t('profile.title') }}
            </p>
            <h1 class="text-4xl font-bold bg-linear-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
              {{ t('profile.heading') }}
            </h1>
            <p class="text-neutral-300 text-lg">
              {{ t('profile.subheading') }}
            </p>
          </div>

          <div class="grid md:grid-cols-2 gap-8">
            <UCard class="border-white/10 bg-white/5">
              <template #header>
                <p class="font-semibold text-white">
                  {{ t('profile.section-title') }}
                </p>
              </template>

              <div class="space-y-6">
                <UFormGroup
                  :label="t('profile.username-label')"
                  class="text-white"
                  :help="t('profile.username-help')"
                >
                  <UInput
                    v-model="form.username"
                    color="primary"
                    :placeholder="t('profile.username-placeholder')"
                    :loading="loading"
                  />
                </UFormGroup>

                <div class="flex flex-wrap gap-3">
                  <UButton
                    color="primary"
                    icon="i-lucide-save"
                    :loading="loading"
                    @click="saveProfile"
                  >
                    {{ t('profile.save-button') }}
                  </UButton>
                  <UButton
                    color="info"
                    variant="ghost"
                    icon="i-lucide-refresh-cw"
                    :loading="loading"
                    @click="loadProfile"
                  >
                    {{ t('profile.reload-button') }}
                  </UButton>
                  <UButton
                    color="secondary"
                    variant="soft"
                    icon="i-lucide-arrow-left"
                    to="/lobby"
                  >
                    {{ t('profile.back-to-lobby-button') }}
                  </UButton>
                </div>
              </div>
            </UCard>

            <div class="space-y-6">
              <UCard class="border-white/10 bg-white/5">
                <template #header>
                  <p class="font-semibold text-white">
                    {{ t('profile.profile-info-title') }}
                  </p>
                </template>
                <div class="space-y-4 text-sm">
                  <div>
                    <p class="text-primary-400 font-semibold mb-1">
                      {{ t('profile.username-label') }}
                    </p>
                    <p class="text-neutral-300">
                      {{ form.username || t('lobby.commander') }}
                    </p>
                  </div>
                  <div class="border-t border-white/10 pt-4">
                    <p class="text-primary-400 font-semibold mb-1">
                      {{ t('profile.profile-info-status-title') }}
                    </p>
                    <p class="text-neutral-300">
                      {{ t('profile.profile-info-status-desc') }}
                    </p>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </UContainer>
      </div>
    </div>
  </div>
</template>

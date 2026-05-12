<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent, ButtonProps } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  redirectPath?: string
}>(), {
  redirectPath: '/lobby'
})

const supabase = useSupabaseClient()
const { t } = useI18n()

const sign = ref<'in' | 'up'>('in')

const aiNames = [
  'Ada',
  'Astra',
  'Cortana',
  'Echo',
  'GLaDOS',
  'HAL',
  'Jarvis',
  'Nova',
  'Orion',
  'Sage',
  'Skye',
  'TARS',
  'Vega'
]

const baseFields = (t: (key: string) => string): AuthFormField[] => [{
  name: 'email',
  type: 'text' as const,
  label: t('auth.email-label'),
  placeholder: t('auth.email-placeholder'),
  required: true
}, {
  name: 'password',
  label: t('auth.password-label'),
  type: 'password' as const,
  placeholder: t('auth.password-placeholder')
}]

const fields = computed<AuthFormField[]>(() => {
  if (sign.value === 'up') {
    return [...baseFields(t), {
      name: 'username',
      label: t('auth.username-label'),
      type: 'text' as const,
      placeholder: t('auth.username-placeholder')
    }]
  }
  return baseFields(t)
})

const randomSuffix = () => Math.floor(100 + Math.random() * 900)
const generateBaseName = () => `${aiNames[Math.floor(Math.random() * aiNames.length)]}-${randomSuffix()}`

const generateUniqueUsername = async (preferred?: string) => {
  let candidate = preferred?.trim() || generateBaseName()
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .limit(1)
      .maybeSingle()

    if (!error && !data) return candidate
    candidate = preferred?.trim() ? `${preferred.trim()}-${randomSuffix()}` : generateBaseName()
  }
  return candidate
}

const ensureProfile = async (userId: string, desired?: string | null) => {
  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle()

  const desiredName = desired?.trim()
  if (desiredName && existing?.username === desiredName) return

  let nameToUse: string | undefined = desiredName
  if (!nameToUse) {
    if (existing?.username) return
    nameToUse = await generateUniqueUsername()
  } else if (existing?.username && existing.username === nameToUse) {
    return
  }

  if (!nameToUse) return

  await supabase
    .from('profiles')
    .upsert({ id: userId, username: nameToUse })
}

const providers: ButtonProps[] = []

const signIn = async (email: string, password: string, username?: string | null) => {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  if (error) {
    console.error(error.message)
    return
  }

  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (uid) await ensureProfile(uid, username)

  await supabase.auth.updateUser({
    data: {
      role: 'user'
    }
  })

  await navigateTo(props.redirectPath)
}

const signUp = async (email: string, password: string, username?: string | null) => {
  const { error } = await supabase.auth.signUp({
    email,
    password
  })
  if (error) console.error(error.message)
  else {
    console.log('Account created. Please confirm your email.')
    await signIn(email, password, username)
  }
}

const onSubmit = async (payload: FormSubmitEvent<{ email: string, password: string, username?: string | null }>) => {
  const email = payload.data.email
  const password = payload.data.password
  const username = payload.data.username

  if (sign.value === 'in') await signIn(email, password)
  else await signUp(email, password, username)
}

const displayError = (error: { message: string }) => {
  console.error(error.message)
}

const signInAsGuest = async () => {
  const { error, data } = await supabase.auth.signInAnonymously()
  if (error) {
    displayError(error)
    return
  }

  const uid = data?.user?.id
  if (uid) await ensureProfile(uid, undefined)

  await navigateTo(props.redirectPath)
}
</script>

<template>
  <div class="space-y-3">
    <UAuthForm
      :title="sign === 'in' ? t('auth.login-title') : t('auth.signup-title')"
      icon="i-lucide-user"
      :fields="fields"
      :providers="providers"
      :submit="{
        label: t('auth.submit-label')
      }"
      @submit="onSubmit"
    >
      <template #description>
        {{ sign === 'up' ? t('auth.already-have-account') : t('auth.dont-have-account') }}
        <UButton
          variant="link"
          class="p-0"
          @click="sign = sign === 'up' ? 'in' : 'up'"
        >
          {{ sign === 'in' ? t('auth.toggle-signup') : t('auth.toggle-signin') }}
        </UButton>.
      </template>
    </UAuthForm>

    <!-- Guest Login Button - Only in Sign In Mode -->
    <UButton
      v-if="sign === 'in'"
      variant="soft"
      color="neutral"
      class="w-full justify-center"
      @click="signInAsGuest"
    >
      {{ t('auth.guest-button') }}
    </UButton>
  </div>
</template>

<script setup>
import * as locales from '@nuxt/ui/locale'

const { locale, t } = useI18n()

useHead(() => ({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: locale.value
  }
}))

const title = computed(() => t('meta.title'))
const description = computed(() => t('meta.description'))
const ogImage = '/logo.png'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage,
  twitterImage: ogImage,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp :locale="locales[locale]">
    <UMain class="p-0">
      <NuxtPage />
    </UMain>
  </UApp>
</template>

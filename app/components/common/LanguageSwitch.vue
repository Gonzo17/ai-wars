<script setup lang="ts">
const { locales, setLocale, locale, localeProperties } = useI18n()

const items = computed(() =>
  locales.value.map(l => ({
    label: l.name ?? l.code.toUpperCase(),
    code: l.code,
    checked: l.code === locale.value,
    type: 'checkbox' as const,
    onSelect: (e: Event) => {
      e.preventDefault()
    },
    onUpdateChecked(checked: boolean) {
      if (checked) {
        setLocale(l.code)
      }
    }
  }))
)
</script>

<template>
  <UDropdownMenu
    :portal="false"
    :modal="false"
    :items="items"
  >
    <UButton
      variant="ghost"
      color="neutral"
      size="sm"
      icon="i-lucide-globe"
      :aria-label="localeProperties.name"
      class="relative! inline-flex items-center justify-center w-9.5! h-9.5! min-w-9.5! p-0! rounded-xl border border-slate-400/18 bg-slate-900/70 shadow-[inset_0_0_16px_rgba(59,130,246,0.12),0_0_12px_rgba(59,130,246,0.12)] hover:border-indigo-400/45 hover:shadow-[inset_0_0_16px_rgba(59,130,246,0.2),0_0_14px_rgba(59,130,246,0.25)] transition-all cursor-pointer [&_svg]:text-base [&_svg]:text-indigo-200"
    />
  </UDropdownMenu>
</template>

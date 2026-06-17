<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({ title: () => t('credits.title') })

interface CreditItem {
  asset: string
  subject: string
  url?: string
}

// Keep in sync with docs/CREDITS.md and scripts/process-images.mjs
const nasaCredits: CreditItem[] = [
  { asset: 'Terrestrial planet', subject: 'Earth — Apollo 17 Blue Marble', url: 'https://images.nasa.gov/details/as17-148-22727' },
  { asset: 'Oceanic planet', subject: 'Neptune — Voyager 2 (PIA01492)', url: 'https://images.nasa.gov/details/PIA01492' },
  { asset: 'Ice-giant planet', subject: 'Uranus — Voyager 2 (PIA18182)', url: 'https://images.nasa.gov/details/PIA18182' },
  { asset: 'Gas giant', subject: 'Jupiter — Cassini (PIA02873)', url: 'https://images.nasa.gov/details/PIA02873' },
  { asset: 'Desert planet', subject: 'Mars (PIA01590)', url: 'https://images.nasa.gov/details/PIA01590' },
  { asset: 'Barren world', subject: 'Tethys — Cassini (PIA21906)', url: 'https://images.nasa.gov/details/PIA21906' },
  { asset: 'Sun', subject: 'Sun — SDO (NASA/SDO)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e001435' },
  { asset: 'Galaxy node', subject: 'Galaxy (PIA12000)', url: 'https://images.nasa.gov/details/PIA12000' },
  { asset: 'Galaxy node', subject: 'Grand-design spiral (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e001979' },
  { asset: 'Galaxy node', subject: 'Spiral galaxy (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e001708' },
  { asset: 'Galaxy node', subject: 'Barred spiral (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e000158' },
  { asset: 'System node', subject: 'Emission nebula (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e000390' },
  { asset: 'System node', subject: 'Nebula + stars (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e000433' },
  { asset: 'System node', subject: 'Nebula with jets (PIA16022)', url: 'https://images.nasa.gov/details/PIA16022' },
  { asset: 'Universe backdrop', subject: 'Face-on spiral galaxy (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e000017' },
  { asset: 'Galaxy backdrop', subject: 'Edge-on spiral galaxy (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e000117' },
  { asset: 'System backdrop', subject: 'Deep field (NASA/ESA Hubble)', url: 'https://images.nasa.gov/details/GSFC_20171208_Archive_e000159' }
]

const telescopeCredits: CreditItem[] = [
  { asset: 'Galaxy', subject: 'Andromeda Galaxy (M31)' },
  { asset: 'Galaxy', subject: 'Galaxy' },
  { asset: 'Solar system', subject: 'Orion Nebula (M42)' },
  { asset: 'Solar system', subject: 'Emission nebula' },
  { asset: 'Solar system', subject: 'Emission nebula' }
]
</script>

<template>
  <div class="bg-static-nasa text-white min-h-screen">
    <div class="bg-linear-to-b from-neutral-900/85 via-neutral-950/90 to-neutral-950/80 min-h-screen">
      <UContainer class="py-8 space-y-6">
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-3xl font-bold">
            {{ t('credits.title') }}
          </h1>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="soft"
            to="/lobby"
          >
            {{ t('credits.back') }}
          </UButton>
        </div>

        <p class="text-neutral-300 max-w-2xl">
          {{ t('credits.intro') }}
        </p>

        <UCard class="border-white/10 bg-white/5">
          <template #header>
            <div>
              <h2 class="text-xl font-semibold">
                {{ t('credits.nasa-title') }}
              </h2>
              <p class="text-sm text-neutral-400 mt-1">
                {{ t('credits.nasa-note') }}
              </p>
            </div>
          </template>
          <ul class="divide-y divide-white/5">
            <li
              v-for="item in nasaCredits"
              :key="item.subject"
              class="flex items-center justify-between gap-4 py-2"
            >
              <span class="text-neutral-300">{{ item.asset }}</span>
              <ULink
                v-if="item.url"
                :to="item.url"
                target="_blank"
                class="text-primary-400 hover:text-primary-300 text-sm font-mono"
              >
                {{ item.subject }}
              </ULink>
              <span
                v-else
                class="text-neutral-400 text-sm font-mono"
              >
                {{ item.subject }}
              </span>
            </li>
          </ul>
        </UCard>

        <UCard class="border-white/10 bg-white/5">
          <template #header>
            <div>
              <h2 class="text-xl font-semibold">
                {{ t('credits.telescope-title') }}
              </h2>
              <p class="text-sm text-neutral-400 mt-1">
                {{ t('credits.telescope-note') }}
              </p>
            </div>
          </template>
          <ul class="divide-y divide-white/5">
            <li
              v-for="(item, idx) in telescopeCredits"
              :key="idx"
              class="flex items-center justify-between gap-4 py-2"
            >
              <span class="text-neutral-300">{{ item.asset }}</span>
              <span class="text-neutral-400 text-sm">{{ item.subject }}</span>
            </li>
          </ul>
        </UCard>
      </UContainer>
    </div>
  </div>
</template>

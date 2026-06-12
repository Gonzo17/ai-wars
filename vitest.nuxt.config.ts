// Nuxt-environment tests — Pinia stores, composables, and any component test
// that relies on Nuxt auto-imports / runtime. Loads a full Nuxt context via
// `@nuxt/test-utils`, which means it shares Nuxt's module resolution and
// (currently) hits a pnpm hoisting issue around @nuxt/kit until that's fixed.
//
// For pure server / domain tests, use vitest.config.ts (the default `pnpm test`).

import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    name: 'nuxt',
    include: ['tests/stores/**/*.test.ts', 'tests/components/**/*.test.ts'],
    environment: 'nuxt',
    globals: true
  }
})

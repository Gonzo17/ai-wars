// Server / domain tests — pure node, no Nuxt environment.
// Covers pure functions in `shared/` and game-engine tests in `tests/server/`
// that drive `InMemoryGameRepository`. This config never loads Nuxt, so it's
// immune to the @nuxt/kit hoisting issues that affect Nuxt-env tests.
//
// For Pinia store and component tests that need Nuxt's auto-imports and
// runtime, see vitest.nuxt.config.ts.

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url))
    }
  },
  test: {
    name: 'server',
    include: ['tests/server/**/*.test.ts', 'tests/shared/**/*.test.ts'],
    environment: 'node',
    globals: true
  }
})

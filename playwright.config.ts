// Playtest harness — drives the real Nuxt app with two browser contexts
// (alice + bob) against the local Supabase instance.
//
// Prerequisites (one-time, see CLAUDE.md):
//   pnpm supabase start
//   pnpm seed:test-users
//
// Run with: pnpm playtest
// Reuses an already-running `pnpm dev` server; otherwise starts one itself.

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './scripts/playtest',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1600, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 300_000
  }
})

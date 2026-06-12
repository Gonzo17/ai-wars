// Shared helpers for the Playwright playtest harness.
//
// Test users come from scripts/seed-test-users.mjs (alice + bob).
// Cleanup talks straight to the local Supabase REST API with the
// service-role key from .env — it refuses to run against non-local URLs.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export const TEST_USERS = {
  alice: { email: 'alice@test.local', username: 'alice' },
  bob: { email: 'bob@test.local', username: 'bob' }
} as const

export const TEST_PASSWORD = 'test-password-1234'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

function loadDotEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function supabaseAdmin() {
  const env = loadDotEnv(resolve(repoRoot, '.env'))
  const url = env.SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error('[playtest] Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env')
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error(`[playtest] Refusing to run against non-local Supabase URL: ${url}`)
  }
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  }
  return {
    async select<T>(path: string): Promise<T[]> {
      const response = await fetch(`${url}/rest/v1/${path}`, { headers })
      if (!response.ok) throw new Error(`[playtest] GET ${path} failed: ${response.status}`)
      return await response.json() as T[]
    },
    async delete(path: string): Promise<void> {
      const response = await fetch(`${url}/rest/v1/${path}`, { method: 'DELETE', headers })
      if (!response.ok) throw new Error(`[playtest] DELETE ${path} failed: ${response.status}`)
    }
  }
}

/**
 * Remove every lobby membership of the test users and every lobby they host,
 * so each playtest run starts from a clean lobby screen. (A leftover
 * `started` lobby would instantly redirect them into the old game.)
 */
export async function cleanupTestLobbies(): Promise<void> {
  const admin = supabaseAdmin()
  const usernames = Object.values(TEST_USERS).map(user => user.username)
  const profiles = await admin.select<{ id: string }>(
    `profiles?username=in.(${usernames.join(',')})&select=id`
  )
  const userIds = profiles.map(profile => profile.id)
  if (userIds.length === 0) {
    throw new Error('[playtest] Test users not found — run `pnpm seed:test-users` first')
  }
  const userFilter = `in.(${userIds.join(',')})`

  const hostedLobbies = await admin.select<{ id: string }>(`lobbies?host_id=${userFilter}&select=id`)
  if (hostedLobbies.length > 0) {
    const lobbyFilter = `in.(${hostedLobbies.map(lobby => lobby.id).join(',')})`
    await admin.delete(`lobby_players?lobby_id=${lobbyFilter}`)
  }
  await admin.delete(`lobby_players?user_id=${userFilter}`)
  await admin.delete(`lobbies?host_id=${userFilter}`)
}

/**
 * Fill a Nuxt UI input by test id — works whether the attribute lands on
 * the wrapper element or on the native <input> itself.
 */
export async function fillTestInput(page: Page, testId: string, value: string): Promise<void> {
  await page
    .locator(`input[data-testid="${testId}"], [data-testid="${testId}"] input`)
    .first()
    .fill(value)
}

/**
 * Log in through the real login form and wait for the lobby page.
 *
 * Retries because in dev mode a click can land before Vue hydration —
 * the browser then performs a native GET form submit (credentials in the
 * query string) instead of running the app's submit handler.
 */
export async function login(page: Page, email: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto('/login', { timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()
    try {
      await page.waitForURL('**/lobby', { timeout: 15_000 })
      return
    } catch {
      // Pre-hydration native submit or slow auth — start over
    }
  }
  throw new Error(`[playtest] Login failed for ${email} after 4 attempts`)
}

/** Dismiss the boot/loading screen once the game page reports ready. */
export async function enterGame(page: Page): Promise<void> {
  await expect(page.getByTestId('loading-ready')).toBeVisible({ timeout: 120_000 })
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('end-turn-button')).toBeVisible({ timeout: 30_000 })
}

/**
 * Complete one full planning turn through the UI:
 * queue a build on every planet that needs one, pick a research,
 * then press end-turn and wait for the waiting state.
 */
export async function playFullTurn(page: Page, buildingId = 'bld:mining-facility'): Promise<void> {
  const endTurn = page.getByTestId('end-turn-button')

  // Queue a build on every planet flagged as needing action
  while (await endTurn.getAttribute('data-state') === 'needs-production') {
    await endTurn.click() // opens the planet overview
    await page.locator('[data-testid^="overview-planet-"][data-needs-action="true"]').first().click()
    await page.locator('[data-testid^="surface-slot-"][data-state="empty"]').first().click()
    await page.getByTestId(`build-option-${buildingId}`).click()
    await page.getByTestId('slot-view-close').click()
    await expect(endTurn).toBeVisible()
  }

  // Pick a research if none is active yet
  if (await endTurn.getAttribute('data-state') === 'needs-research') {
    await endTurn.click() // opens the research tree
    const tech = page.locator('[data-testid^="tech-node-"][data-status="available"]').first()
    await tech.click()
    await page.getByTestId('research-close').click()
    await expect(endTurn).toBeVisible()
  }

  await expect(endTurn).toHaveAttribute('data-state', 'ready')
  await endTurn.click()
  await expect(endTurn).toHaveAttribute('data-state', 'waiting')
}

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
import type { GameSnapshot, PlanetSlotData, Unit, UnitId } from '../../shared/types/game'

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
    },
    async patch(path: string, body: unknown): Promise<void> {
      const response = await fetch(`${url}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error(`[playtest] PATCH ${path} failed: ${response.status} ${await response.text()}`)
    }
  }
}

/** Resolve a seeded test user's auth id (matches the `userId` on snapshot players). */
export async function getUserId(username: string): Promise<string> {
  const admin = supabaseAdmin()
  const profiles = await admin.select<{ id: string }>(`profiles?username=eq.${username}&select=id`)
  const id = profiles[0]?.id
  if (!id) throw new Error(`[playtest] User '${username}' not found — run \`pnpm seed:test-users\``)
  return id
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

/**
 * Lean lobby flow: alice creates, bob joins, alice starts. Returns the gameId
 * (from the /game?gameId=… URL). Both pages end up on the game route.
 */
export async function startGame(alice: Page, bob: Page): Promise<string> {
  const lobbyName = `tour-${Date.now()}`
  await fillTestInput(alice, 'lobby-name-input', lobbyName)
  await alice.getByTestId('create-lobby-button').click()
  await expect(alice.getByTestId('start-game-button')).toBeVisible()

  const lobbyRow = bob.locator(`[data-testid="lobby-row"][data-lobby-name="${lobbyName}"]`)
  try {
    await expect(lobbyRow).toBeVisible({ timeout: 10_000 })
  } catch {
    await bob.reload()
    await expect(lobbyRow).toBeVisible({ timeout: 15_000 })
  }
  await lobbyRow.getByTestId('join-lobby-button').click()
  await expect(bob.getByTestId('leave-lobby-button')).toBeVisible()
  await expect(alice.getByText(TEST_USERS.bob.username, { exact: true })).toBeVisible({ timeout: 15_000 })
  await alice.getByTestId('start-game-button').click()

  await alice.waitForURL('**/game**', { timeout: 60_000 })
  await bob.waitForURL('**/game**', { timeout: 60_000 })

  const gameId = new URL(alice.url()).searchParams.get('gameId')
  if (!gameId) throw new Error(`[playtest] Could not read gameId from URL: ${alice.url()}`)
  return gameId
}

/** Fetch the latest game_state snapshot, mutate it in place, write it back, and
 *  forward whatever the mutator returns (e.g. the seeded entity ids). */
export async function patchGameState<T>(gameId: string, mutate: (snapshot: GameSnapshot) => T): Promise<T> {
  const admin = supabaseAdmin()
  const rows = await admin.select<{ turn: number, state_json: GameSnapshot }>(
    `game_state?game_id=eq.${gameId}&order=turn.desc&limit=1&select=turn,state_json`
  )
  const row = rows[0]
  if (!row) throw new Error(`[playtest] No game_state found for game ${gameId}`)
  const result = mutate(row.state_json)
  await admin.patch(`game_state?game_id=eq.${gameId}&turn=eq.${row.turn}`, { state_json: row.state_json })
  return result
}

export interface SeedIds {
  homeSystemId: string
  homeworldId: string
  barrenId: string | null
  starId: string | null
}

const completedSlot = (index: number, buildingId: string, node: PlanetSlotData['resourceNode'] = null): PlanetSlotData => ({
  index, zone: 'orbital', buildingId: buildingId as PlanetSlotData['buildingId'], buildingLevel: 1, isConstructing: false, constructionTimeLeft: 0, resourceNode: node
})

/**
 * Inject a rich state for `userId` so every dialog is reachable in one tour:
 * a captured home star with a Dyson stage + Stellar Shipyard, an owned barren
 * world (exotic deposit), an idle fleet in the home system, full resources
 * (incl. strategic), and the survey/shipyard techs researched.
 */
export function seedRichState(snapshot: GameSnapshot, userId: string): SeedIds {
  const player = snapshot.players.find(p => p.userId === userId)
  if (!player) throw new Error(`[playtest] Player for user ${userId} not in snapshot`)
  const playerId = player.id

  const homeworld = snapshot.planets.find(p => p.owner === playerId && p.kind !== 'star')
  if (!homeworld) throw new Error('[playtest] Homeworld not found in snapshot')
  const homeSystemId = homeworld.systemId

  // Resources: plenty of base + some strategic so builds are affordable and shown.
  const setRes = (key: string, current: number) => {
    const res = player.resources.find(r => r.key === key)
    if (res) res.current = current
  }
  setRes('res:energy', 6000)
  setRes('res:material', 6000)
  setRes('res:rare', 2000)
  setRes('res:exotic-matter', 120)
  setRes('res:antimatter', 120)

  // Unlock the build options the tour touches.
  for (const tech of ['tech:exotic-matter-survey', 'tech:antimatter-containment', 'tech:first-shipyard', 'tech:colony-ship-design']) {
    if (!player.research.completedTechIds.includes(tech)) player.research.completedTechIds.push(tech)
  }

  // Capture the home star with a Dyson stage + Stellar Shipyard.
  const star = snapshot.planets.find(p => p.kind === 'star' && p.systemId === homeSystemId)
  if (star) {
    star.owner = playerId
    star.slots[0] = completedSlot(0, 'bld:dyson-sphere')
    star.slots[1] = completedSlot(1, 'bld:orbital-shipyard-mega')
  }

  // Own a barren world (carries an exotic-matter deposit) for the extractor menu.
  const barren = snapshot.planets.find(p => p.type === 'barren' && p.owner === 'unclaimed')
  if (barren) {
    barren.owner = playerId
    if (!player.planets.includes(barren.id)) player.planets.push(barren.id)
  }

  // An idle fleet in the home system → fleet panel + move select.
  const fleet: Unit = {
    id: 'unit:frigate#tour' as UnitId,
    defId: 'unit:frigate' as UnitId,
    type: 'battleship',
    name: 'Frigate',
    status: 'idle',
    location: homeSystemId,
    strength: 4,
    ownerId: playerId
  }
  snapshot.fleets.push(fleet)

  return { homeSystemId, homeworldId: homeworld.id, barrenId: barren?.id ?? null, starId: star?.id ?? null }
}

/** Save a screenshot artifact under test-results/ui-tour for manual/AI review. */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/ui-tour/${name}.png` })
}

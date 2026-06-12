// Golden path: two real players (alice + bob) log in, meet in a lobby,
// start a game and play the first turn — builds, research, end turn —
// until the server resolves and both clients show the next turn.

import { test, expect } from '@playwright/test'
import { TEST_USERS, cleanupTestLobbies, enterGame, fillTestInput, login, playFullTurn } from './helpers'

test('two players play the first turn through the real UI', async ({ browser }) => {
  await cleanupTestLobbies()

  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()

  await login(alice, TEST_USERS.alice.email)
  await login(bob, TEST_USERS.bob.email)

  // ── Lobby: alice creates, bob joins, alice starts ────────────────────
  const lobbyName = `playtest-${Date.now()}`
  await fillTestInput(alice, 'lobby-name-input', lobbyName)
  await alice.getByTestId('create-lobby-button').click()
  await expect(alice.getByTestId('start-game-button')).toBeVisible()

  // bob should see the lobby via realtime; reload once as fallback
  const lobbyRow = bob.locator(`[data-testid="lobby-row"][data-lobby-name="${lobbyName}"]`)
  try {
    await expect(lobbyRow).toBeVisible({ timeout: 10_000 })
  } catch {
    await bob.reload()
    await expect(lobbyRow).toBeVisible({ timeout: 15_000 })
  }
  await lobbyRow.getByTestId('join-lobby-button').click()
  await expect(bob.getByTestId('leave-lobby-button')).toBeVisible()

  // alice sees bob in the member list, then starts the game
  await expect(alice.getByText(TEST_USERS.bob.username, { exact: true })).toBeVisible({ timeout: 15_000 })
  await alice.getByTestId('start-game-button').click()

  await alice.waitForURL('**/game**', { timeout: 60_000 })
  // bob is redirected automatically via the lobby realtime watcher
  await bob.waitForURL('**/game**', { timeout: 60_000 })

  // ── Game: boot screen, then both play their turn ────────────────────
  await enterGame(alice)
  await enterGame(bob)

  // Turn 1 → year 0 on both clients
  await expect(alice.getByTestId('year-display')).toHaveText('0')
  await expect(bob.getByTestId('year-display')).toHaveText('0')

  await playFullTurn(alice)
  await playFullTurn(bob)

  // Server resolves once both are ready; realtime pushes turn 2 → year 1
  await expect(alice.getByTestId('year-display')).toHaveText('1', { timeout: 60_000 })
  await expect(bob.getByTestId('year-display')).toHaveText('1', { timeout: 60_000 })

  // Fresh planning phase: no longer waiting — builds/research from turn 1
  // are still running, so the state is `ready` (or needs-* if something finished)
  await expect(alice.getByTestId('end-turn-button')).toHaveAttribute('data-state', /^(ready|needs-production|needs-research)$/, { timeout: 30_000 })
  await expect(bob.getByTestId('end-turn-button')).toHaveAttribute('data-state', /^(ready|needs-production|needs-research)$/, { timeout: 30_000 })

  await aliceContext.close()
  await bobContext.close()
})

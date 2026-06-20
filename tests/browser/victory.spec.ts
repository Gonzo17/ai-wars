// Victory UI: seed a victory countdown and a finished game straight into the
// snapshot, then capture the countdown banner and the game-over overlay.
// Mirrors the ui-tour seeding approach (admin REST patch of game_state).

import { test, expect } from '@playwright/test'
import {
  TEST_USERS, cleanupTestLobbies, enterGame, getUserId, login,
  patchGameState, shot, startGame
} from './helpers'

test('shows the victory countdown banner and game-over overlay', async ({ browser }) => {
  test.slow() // two seeded reloads

  await cleanupTestLobbies()

  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()

  await login(alice, TEST_USERS.alice.email)
  await login(bob, TEST_USERS.bob.email)

  const gameId = await startGame(alice, bob)
  const aliceId = await getUserId(TEST_USERS.alice.username)
  await bobContext.close() // bob not needed beyond the lobby start

  // ── Countdown banner: alice is mid-ascension ─────────────────────────
  await patchGameState(gameId, (snapshot) => {
    const playerId = snapshot.players.find(p => p.userId === aliceId)!.id
    snapshot.victory = {
      pending: [{ playerId, condition: 'military', startedTurn: snapshot.turn, winTurn: snapshot.turn + 3 }]
    }
  })
  await alice.reload()
  await enterGame(alice)
  await expect(alice.getByTestId('victory-banner')).toBeVisible()
  await shot(alice, '17-victory-banner')

  // ── Game over: alice has won ─────────────────────────────────────────
  await patchGameState(gameId, (snapshot) => {
    const playerId = snapshot.players.find(p => p.userId === aliceId)!.id
    snapshot.victory = { pending: [], winnerId: playerId, winningCondition: 'military' }
  })
  await alice.reload()
  await enterGame(alice)
  await expect(alice.getByTestId('victory-overlay')).toBeVisible()
  await expect(alice.getByTestId('victory-overlay-home')).toBeVisible()
  await shot(alice, '18-victory-overlay')

  await aliceContext.close()
})

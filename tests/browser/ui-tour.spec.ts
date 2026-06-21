// UI tour: seed one rich game state, then drive alice through every major
// menu/dialog so the UI stays wired up. Captures a screenshot artifact per
// dialog under test-results/ui-tour/ for manual/visual review (no pixel diff).
//
// Reaching deep dialogs (star slot view, fleet panel, strategic extractor) in a
// fresh game would take many turns, so we seed a crafted snapshot straight into
// the DB after a normal lobby start (see seedRichState in helpers).

import { test, expect } from '@playwright/test'
import {
  TEST_USERS, cleanupTestLobbies, enterGame, getUserId, login,
  patchGameState, seedRichState, shot, startGame
} from './helpers'

test('tours every major dialog on a seeded game', async ({ browser }) => {
  test.slow() // many sequential dialogs + a seeded reload

  await cleanupTestLobbies()

  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()

  await login(alice, TEST_USERS.alice.email)
  await login(bob, TEST_USERS.bob.email)

  // Start a real game, then inject a rich state for alice.
  const gameId = await startGame(alice, bob)
  const aliceId = await getUserId(TEST_USERS.alice.username)
  const ids = await patchGameState(gameId, snapshot => seedRichState(snapshot, aliceId))
  await bobContext.close() // bob not needed for the tour

  // Reload so the client picks up the seeded snapshot, then enter the game.
  await alice.reload()
  await enterGame(alice)
  await alice.getByTestId('home-button').click()
  await expect(alice.getByTestId('end-turn-button')).toBeVisible()
  await shot(alice, '01-system-map')

  // ── TopBar resource tooltip: per-planet production breakdown ──────────
  await alice.getByTestId('resource-pill-res:energy').hover()
  await expect(alice.getByTestId('resource-breakdown-res:energy')).toBeVisible()
  await shot(alice, '01b-resource-breakdown')

  // ── Research tree + ascension gate ───────────────────────────────────
  await alice.getByTestId('research-button').click()
  await expect(alice.locator('[data-testid^="tech-node-"]').first()).toBeVisible()
  await expect(alice.locator('[data-testid^="ascension-gate-"]').first()).toBeVisible()
  await shot(alice, '02-research-tree')
  await alice.getByTestId('research-close').click()

  // ── Event log ────────────────────────────────────────────────────────
  await alice.getByTestId('event-log-button').click()
  await expect(alice.getByTestId('event-log-panel')).toBeVisible()
  await shot(alice, '03-event-log')
  await alice.getByTestId('event-log-close').click()

  // ── Planet overview → homeworld slot view → Civ-style build flow ─────
  await alice.getByTestId('planet-overview-button').click()
  await expect(alice.getByTestId('planet-overview-panel')).toBeVisible()
  await shot(alice, '04-planet-overview')
  await alice.getByTestId(`overview-planet-${ids.homeworldId}`).click()
  await expect(alice.locator('[data-testid^="surface-slot-"]').first()).toBeVisible()
  await expect(alice.getByTestId('build-queue')).toBeVisible()
  await shot(alice, '05-planet-slot-view')
  // Side list is the catalog; rows show name + rounds, details on hover.
  await expect(alice.locator('[data-testid^="build-list-option-"]').first()).toBeVisible()
  await alice.getByTestId('build-list-option-bld:solar-array').hover()
  await expect(alice.getByTestId('build-list-option-bld:solar-array-tooltip')).toBeVisible()
  await shot(alice, '05b-build-list-tooltip')
  // Picking a building enters placement mode.
  await alice.getByTestId('build-list-option-bld:solar-array').click()
  // An empty slot is now a highlighted placement target — click it to queue.
  await alice.locator('[data-testid^="surface-slot-"][data-state="empty"]').first().click()
  await expect(alice.getByTestId('queue-item-0')).toBeVisible()
  await shot(alice, '06-build-queue')
  // Units queue straight from the Units tab (no placement).
  await alice.getByTestId('build-list-tab-units').click()
  await alice.getByTestId('build-list-option-unit:worker').click()
  await expect(alice.getByTestId('queue-item-1')).toBeVisible()
  await shot(alice, '06b-multi-queue')
  await alice.getByTestId('slot-view-close').click()

  // ── Strategic deposit: barren world → extractor placement preview ────
  if (ids.barrenId) {
    await alice.getByTestId('planet-overview-button').click()
    await alice.getByTestId(`overview-planet-${ids.barrenId}`).click()
    await expect(alice.getByTestId('surface-slot-2')).toBeVisible()
    await shot(alice, '07-barren-planet')
    // Selecting the extractor highlights its matching deposit slot; hovering previews yield.
    await alice.getByTestId('build-list-option-bld:exotic-extractor').click()
    await alice.getByTestId('surface-slot-2').hover() // the exotic-matter deposit slot
    await expect(alice.getByTestId('placement-preview')).toBeVisible()
    await shot(alice, '08-extractor-placement')
    await alice.getByTestId('slot-view-close').click()
  }

  // ── Star slot view: megastructure list + placement + shipyard ────────
  if (ids.starId) {
    await alice.getByTestId('home-button').click()
    await alice.getByTestId(`map-node-${ids.starId}`).click()
    await expect(alice.getByTestId('star-view-close')).toBeVisible()
    await shot(alice, '09-star-slot-view')
    await expect(alice.locator('[data-testid^="star-build-list-option-"]').first()).toBeVisible()
    await alice.getByTestId('star-build-list-option-bld:dyson-sphere').click()
    await alice.locator('[data-testid^="star-shell-"][data-state="empty"]').first().click()
    await expect(alice.getByTestId('star-queue-item-0')).toBeVisible()
    await shot(alice, '10-megastructure-queued')
    // Stellar Shipyard was seeded → the Ships tab can queue a frigate.
    await alice.getByTestId('star-tab-units').click()
    await expect(alice.locator('[data-testid^="star-build-list-option-unit:"]').first()).toBeVisible()
    await shot(alice, '11-shipyard-list')
    await alice.getByTestId('star-view-close').click()
  }

  // ── Fleet panel + move order ─────────────────────────────────────────
  await alice.getByTestId('home-button').click()
  await expect(alice.getByTestId('fleet-panel')).toBeVisible()
  await shot(alice, '12-fleet-panel')
  await alice.getByTestId('fleet-move-select').first().click()
  await shot(alice, '13-fleet-move')
  await alice.keyboard.press('Escape')

  // ── Map zoom-out levels ──────────────────────────────────────────────
  await alice.getByTestId('map-back').click() // system → galaxy
  await shot(alice, '14-galaxy-map')
  await alice.getByTestId('map-back').click() // galaxy → universe
  await shot(alice, '15-universe-map')

  // ── Credits page ─────────────────────────────────────────────────────
  await alice.goto('/credits')
  await expect(alice.getByText(/NASA/i).first()).toBeVisible()
  await shot(alice, '16-credits')

  await aliceContext.close()
})

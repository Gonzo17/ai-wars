# CLAUDE.md

Project context for Claude Code working on **Ascension of AI** — a turn-based sci-fi strategy game where players control competing AI systems.

## TL;DR

- Stack: Nuxt 4 + Vue 3 + TypeScript + Pinia + Nuxt UI + Tailwind + i18n + Supabase + Vitest.
- The game is **server-authoritative** with simultaneous-turn resolution.
- Domain logic lives in [shared/](shared/); the client and server both import from it.
- Backend lives in [server/](server/) (Nitro routes + game engine).

## Mental model: turn flow

```
┌─────────────────────┐
│ Client (game.vue)   │  build TurnPlan locally
│   useAuthFetch()    │──┐
└─────────────────────┘  │
                         ▼
┌────────────────────────────────────────────────┐
│ POST /api/games/[id]/turn  (turn.post.ts)      │
│  → submitTurn(repo, userId, gameId, turn, plan)│  store plan + mark ready
│      → resolveTurn(repo, gameId, turn)         │  if all players ready
│          • tryAcquireResolveLock()             │  prevents double-resolve
│          • applyPlan() per player              │  deduct costs, queue builds
│          • advanceResearch()                   │  progress + complete techs
│          • advanceQueues()                     │  progress + complete builds
│          • insertGameState(turn+1, snapshot)   │  write next snapshot
│          • updateGameTurn(turn+1)              │  bump game.turn
└────────────────────────────────────────────────┘
```

Key invariant: **a snapshot at turn N is what the world looks like at the START of turn N**, *before* any plans for turn N have been applied. Plans for turn N produce the snapshot at turn N+1.

## Directory layout

| Path | Purpose |
|---|---|
| [app/](app/) | Nuxt client — pages, components, stores, composables. UI only. |
| [server/api/](server/api/) | Nitro HTTP endpoints. Thin — delegate to `server/game/`. |
| [server/game/](server/game/) | Game engine: turn submission, turn resolution, initial state. |
| [server/utils/](server/utils/) | Server-only helpers (e.g. `resolveUserId`). |
| [shared/types/](shared/types/) | TypeScript types used by client AND server. |
| [shared/defs/](shared/defs/) | Static game data — `TECH_DEFS`, `BUILDING_DEFS`, `UNIT_DEFS`. |
| [shared/validation/](shared/validation/) | Pure functions usable on both sides. |
| [supabase/migrations/](supabase/migrations/) | Database schema. Numbered, append-only. |
| [tests/](tests/) | Vitest tests. `tests/server/` uses `InMemoryGameRepository`. |
| [scripts/](scripts/) | Dev helper scripts (seed users, etc.). |
| [memory/](memory/) | Claude's project memory. Read before making design decisions. |

## Conventions

- **`~~/` alias** = repo root. Use it everywhere (`~~/shared/...`, `~~/server/...`).
- **Import direction**: `shared/` MUST NOT import from `server/` or `app/`. `server/` and `app/` may import from `shared/`.
- **`toPlayerId(userId)`** — always convert Supabase `user.id` (raw UUID) to the branded `PlayerId` type before using it in game logic. There are two copies of this function — [shared/utils/playerId.ts](shared/utils/playerId.ts) for the client and [server/game/playerId.ts](server/game/playerId.ts) for the server. They must stay in sync.
- **Static defs are the source of truth** for game balance. Don't hardcode building/unit/tech values anywhere else.
- **i18n keys** use kebab-case dot paths (e.g. `game.buildings.solar-array.name`). All UI strings go through `t()`. Locales: en, de.

## Dev workflow

### One-time setup

```bash
pnpm install
pnpm supabase start         # boots local Postgres + Auth + Realtime
pnpm supabase:types         # regenerates app/types/database.types.ts
pnpm seed:test-users        # creates alice + bob in local Supabase (see below)
```

### Run the app

```bash
pnpm dev                    # http://localhost:3000
```

### Test commands

```bash
pnpm test                   # vitest run
pnpm typecheck              # nuxt typecheck (vue-tsc)
pnpm lint                   # eslint .
```

### Adding a migration

```bash
pnpm supabase migration new <name>
# edit the new SQL file under supabase/migrations/
pnpm supabase db reset      # reapplies migrations + seed locally
pnpm supabase:types         # regenerate types
```

## Auth (production vs dev/tests)

Production flow: [useAuthFetch()](app/composables/useAuthFetch.ts) attaches a bearer token from the Supabase session; the server resolves it via [resolveUserId()](server/utils/resolveUserId.ts).

For **automated tests and the playtest harness**, `resolveUserId` supports a dev-only bypass:

- Set `NUXT_DEV_TEST_MODE=true` when starting the dev server.
- Requests with header `x-test-user-id: <uuid>` resolve directly to that user.
- Gated by `import.meta.dev` so it's a no-op in production builds.

To run the dev server with bypass enabled:

```bash
# bash / git-bash
NUXT_DEV_TEST_MODE=true pnpm dev

# PowerShell
$env:NUXT_DEV_TEST_MODE='true'; pnpm dev
```

The seed script ([scripts/seed-test-users.mjs](scripts/seed-test-users.mjs)) creates two known users in local Supabase so the **client side** (Supabase session, RLS-protected queries, realtime) also works. Credentials are printed by the script — see its output.

## Gotchas (things that have bitten me)

1. **Tech gating is live** (since June 2026): several buildings/units in `BUILDING_DEFS`/`UNIT_DEFS` carry `requirements.research`, enforced server-side in `validateTurnPlan` and surfaced in the UI via the `locked`/`lockedByTechName` catalog fields built in `game.vue`. When adding a building/unit, decide which tech gates it; `getUnlocksForTech()` drives the "Unlocks" display in the research tree.
2. **`isResume` semantics in resolve**: building the same building in the same slot keeps existing construction progress and does NOT re-deduct resources. Switching pays again. See `applyPlan()` in [resolveTurn.ts](server/game/resolveTurn.ts).
3. **`progressMemory`** stores per-build production progress so a cancelled or replaced build doesn't lose what was already invested. Lives on `Planet.progressMemory` (per-planet, per-buildId) and on `PlayerSnapshot.research.progressMemory` (per-tech).
   - **Production & research output goes through `slotOutput()` in [shared/utils/synergies.ts](shared/utils/synergies.ts)** (since June 2026), not raw `def.resourceProduction`. Three synergies make placement matter: ore-extraction (mineral building on ore node ×2 minerals), power-grid (energy building +25% per adjacent surface energy building), compute-uplink (data center +25% research per planet energy building, capped +100%). `economy.ts` sums `slotOutput` across slots; `activeSynergies()` drives the UI preview badges.
4. **`productionCarryover`** rolls excess production from a completed build into the next turn's production pool on that planet.
5. **Fleet movement runs on the star-lane graph** (since June 2026): `advanceFleets()` in resolveTurn moves en-route fleets one lane per turn along the BFS shortest path (`shared/utils/starlanes.ts`); validation rejects unreachable targets. Fleets get a unique instance `id` on completion — the definition lookup key is `Unit.defId`. `Galaxy.connections` is still unused.
6. **Combat & colonization run after movement** (since June 2026): `resolveCombat()` clashes fleets where 2+ owners share a *system* (defense is system-granular, vision); pure math in `shared/utils/combat.ts` (offense = strength × type weight, weakest ships die first, ties = mutual destruction). `resolveColonization()` then lets an idle `unitType: 'colonizer'` fleet (`unit:colony-ship`) capture an unclaimed or undefended-enemy planet in its system, consuming the ship. `empireState.planetsControlled` is recomputed each resolve.
7. **Fog of war is applied on read** (since June 2026): the DB stores the full snapshot, but `state.get` runs `redactSnapshotFor(snapshot, viewerId)` ([server/game/redactSnapshot.ts](server/game/redactSnapshot.ts)) before returning — enemy planet contents, enemy private state (resources/research/events) and out-of-sight enemy fleets are stripped. Server game logic (resolveTurn) always works on the full snapshot; only the API response is redacted. `turn_plans` SELECT is restricted to own rows via RLS so opponents can't read submitted plans pre-resolution.
8. **Game phase `resolving` is a transient lock.** Clients cannot submit or unsubmit while phase is `resolving`. Resolution is fast and atomic — phase flips back to `planning` after the snapshot is written.
9. **The `~~/` alias resolves at build time only**. Don't expect it inside string-based dynamic imports.
10. **Two `toPlayerId` implementations** exist (client + server) — keep them identical.
11. **Stars are build sites with `site`-gated megastructures** (since June 2026): a `Planet` with `kind: 'star'` reuses all planet machinery (economy/queues/fog/combat) but is captured by a `unit:star-constructor` (not a colony ship) via `resolveStarCapture()`, and has shell slots from `createStarSlots()` (no surface zone). `BuildingDefinition.site` (`'planet' | 'star'`, default planet) gates placement in `validateTurnPlan` — megastructures (`bld:dyson-sphere` staged, `bld:matrioshka-brain`, `bld:orbital-shipyard-mega`, `bld:star-fortress`) only on stars, normal buildings only on planets. The client splits the catalog by site; the sun node opens `GameStarSlotView` (concentric shells + closing Dyson hull). `FACILITY_SUBSTITUTES` lets a completed stellar shipyard satisfy a `bld:orbital-dock` unit requirement (build ships on a star). `systemHasEnemyFortress()` makes a completed `bld:star-fortress` block enemy colonization/star-capture in its system (no siege mechanic yet).
12. **`updatePlanetsControlled()` runs AFTER `advanceQueues()`** in resolve, so `empireState` (`planetsControlled`, `starsControlled`, `dysonStages`) reflects buildings completed *this* turn. It feeds the ascension gates — **K2.0 = 1 star + 1 Dyson stage** (`requiresEmpire: { starsControlled, dysonStages }` in `research-tree.ts`, evaluated in `app/stores/research.ts`).

## Testing strategy

- **Unit tests** (`tests/...`) for pure functions in `shared/` — fast, no setup.
- **Integration tests** (`tests/server/...`) drive full turn cycles through `InMemoryGameRepository`. This is where most game-logic regressions get caught. Mirror the patterns in [tests/server/turn-cycle.test.ts](tests/server/turn-cycle.test.ts).
- **e2e/playtest** (`pnpm playtest`, specs in [tests/browser/](tests/browser/)) runs the real Nuxt app with two Playwright browser contexts as alice + bob through the full UI (login → lobby → game → end turn → resolution). Requires local Supabase running + seeded test users. Reuses a running `pnpm dev` server, otherwise starts one. Slow — reserve for golden paths. UI elements are addressed via `data-testid` attributes; when adding UI that the playtest must touch, add a testid rather than text selectors.

When adding game mechanics, write integration tests first using `InMemoryGameRepository`. The pattern: seed initial repo state, call `submitTurn` for each player, call `resolveTurn`, assert on the resulting snapshot.

## Where to look first

- **Adding a building/unit/tech**: edit the relevant array in [shared/defs/](shared/defs/). Add i18n keys in [i18n/locales/](i18n/locales/).
- **Changing turn resolution**: [server/game/resolveTurn.ts](server/game/resolveTurn.ts).
- **Changing what's in the initial game state**: [server/game/initialState.ts](server/game/initialState.ts).
- **Adding an API endpoint**: [server/api/](server/api/) — follow existing patterns (auth via `resolveUserId`, return `{ ... }`).
- **Adding a UI panel**: [app/components/game/](app/components/game/) — keep components dumb; data flows from [app/pages/game.vue](app/pages/game.vue).

## Current focus: roadmap to strategic depth

The long-term product vision (inspirations, format, hard rules, known design debt,
megastructures) lives in [docs/VISION.md](docs/VISION.md) — read it before proposing
or planning features. The list below is the agreed *next steps* toward that vision.

The MVP works (auth, lobby, turn engine, economy, research tree, multi-zoom map). The original five-move plan to add stakes is now mostly done:

1. ✅ **Tech → unlocks** (commit c9a542b). `requirements.research` enforced; locked-building UI; research tree shows unlocks.
2. ✅ **Star-lane fleet movement** (commit aa5bc69). `SolarSystem.connections` BFS, one lane/turn, fleet panel UI.
3. ✅ **Minimal combat + conquest** (commit 2837269). System-granular fleet clash + colony-ship planet capture.
4. ✅ **Building synergies** (commit a34e304). Ore ×2, power grid, compute uplink via `slotOutput()`.
5. ⛔ **Dumb AI opponent — dropped as a product feature.** Per [docs/VISION.md](docs/VISION.md), the game is multiplayer-only with no bots; the dev-testing need this was meant to solve is covered by the Playwright playtest harness. Only revisit as an explicit dev tool if asked.

Beyond the original five, the **stellar progression spine** is now in (confirm scope before extending):

6. ✅ **Stars as capturable build sites** (commit f9dae46). Star constructor + `resolveStarCapture`.
7. ✅ **Megastructures on stars** (commits 721860a, 707a4dc). Site-gated catalog, `GameStarSlotView` shell UI with closing Dyson hull, K2.0 = 1 star + 1 Dyson stage, functional Stellar Shipyard + Star Fortress. Balance numbers are placeholders — a tuning pass is deferred until the whole loop is playable.

**Next candidates** (toward the vision, confirm before starting): **Tech-tree content rework** (Step 3 — restructure the `AscensionTier` ladder to a short 0.6→2.0 on-ramp + stretched stellar era, then rebuild `TECH_DEFS` with real depth; the current content is the #1 known weakness) and **planet terrain types** for deeper placement (Step 4). Then the three victory conditions + planet-cracker (see VISION.md), and the K3.0 expansion gate (`galaxyStarFraction`). Balance pass on all costs/outputs once the loop is playable. The Star Fortress still needs a siege mechanic (it is currently an absolute block).

**Explicitly out of scope right now:** hex map (the star-lane graph is the genre-idiomatic answer), asymmetric factions, diplomacy, trade, animations/polish, and any move off the Nuxt browser stack. Do not propose features outside the vision without checking first.

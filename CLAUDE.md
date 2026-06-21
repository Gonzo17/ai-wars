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
2. **Production is a shared, ordered, declarative queue** (Civ-style, since June 2026 — Phase B): each `Planet.queues.production` is one ordered list of `ProductionQueueItem` (`{kind:'building',slotIndex,buildingId}` | `{kind:'unit',unitId,productionSpent}`), buildings and units interleaved, capped at `BUILD_QUEUE_LIMIT` (6). The client owns the desired queue and sends the **whole list** as a single `setProductionQueue` command per planet (add/cancel/reorder = resend); `reconcileProductionQueue()` in [shared/utils/productionQueue.ts](shared/utils/productionQueue.ts) is the one place that classifies each item as new-vs-resume — used identically by `validateTurnPlan`, the resolveTurn deduction loop, AND `applyPlan`, so they always agree. **Resource cost is paid up-front when an item is first added** (resume = same building already constructing in that slot, or a unit matched greedily by id to an in-progress one → not re-charged). `advanceQueues` only advances the **front** item per turn; on completion it pops and rolls overflow into `productionCarryover` (next turn), no same-turn cascade. UI: side-list catalog + placement mode (`PlanetSlotView`/`StarSlotView`) emit `queue-build`/`remove-queue-item`/`reorder-queue`; `game.vue` keeps the optimistic `buildQueueOverrides` per planet. *Cost-timing is up-front, not pay-on-start; cancelling forfeits paid resources (no refund). Switching a slot's building needs a cancel one turn, re-place the next (validation checks the live server slot).*
3. **`progressMemory`** still stores per-tech research progress on `PlayerSnapshot.research.progressMemory`. The per-planet `Planet.progressMemory` field is legacy/unused for the production queue now — unit progress lives on the queue item's `productionSpent` (so reorder is lossless), building progress on the slot's `constructionTimeLeft`.
   - **Production & research output goes through `slotOutput()` in [shared/utils/synergies.ts](shared/utils/synergies.ts)** (since June 2026), not raw `def.resourceProduction`. Three synergies make placement matter: ore-extraction (mineral building on ore node ×2 minerals), power-grid (energy building +25% per adjacent surface energy building), compute-uplink (data center +25% research per planet energy building, capped +100%). `economy.ts` sums `slotOutput` across slots; `activeSynergies()` drives the UI preview badges.
4. **`productionCarryover`** rolls excess production from a completed build into the next turn's production pool on that planet.
5. **Fleet movement runs on the star-lane graph** (since June 2026): `advanceFleets()` in resolveTurn moves en-route fleets one lane per turn along the BFS shortest path (`shared/utils/starlanes.ts`); validation rejects unreachable targets. Fleets get a unique instance `id` on completion — the definition lookup key is `Unit.defId`. `Galaxy.connections` is still unused. **Planned rework** (see VISION *Navigation & combat*): unify all three zoom levels into one weighted graph (intra-system + inter-galaxy edges, gateway nodes, per-edge `distance`, per-unit `speed`); this is the largest navigation change ahead.
6. **Combat & colonization run after movement** (since June 2026): `resolveCombat()` clashes fleets where 2+ owners share a *system*; pure one-shot math in `shared/utils/combat.ts` (offense = strength × type weight, weakest ships die first, ties = mutual destruction). **This is current impl only — the vision has moved on**: VISION *Navigation & combat* replaces it with edge-granular, round-based combat (attack/defence, abilities, per-round flee decisions, pinning) on lanes, and drops the "defence is system-granular" model for a gateway/interception one. `resolveColonization()` then lets an idle `unitType: 'colonizer'` fleet (`unit:colony-ship`) capture an unclaimed or undefended-enemy planet in its system, consuming the ship. `empireState.planetsControlled` is recomputed each resolve.
7. **Fog of war is applied on read** (since June 2026): the DB stores the full snapshot, but `state.get` runs `redactSnapshotFor(snapshot, viewerId)` ([server/game/redactSnapshot.ts](server/game/redactSnapshot.ts)) before returning — enemy planet contents, enemy private state (resources/research/events) and out-of-sight enemy fleets are stripped. Server game logic (resolveTurn) always works on the full snapshot; only the API response is redacted. `turn_plans` SELECT is restricted to own rows via RLS so opponents can't read submitted plans pre-resolution.
8. **Game phase `resolving` is a transient lock.** Clients cannot submit or unsubmit while phase is `resolving`. Resolution is fast and atomic — phase flips back to `planning` after the snapshot is written.
9. **The `~~/` alias resolves at build time only**. Don't expect it inside string-based dynamic imports.
10. **Two `toPlayerId` implementations** exist (client + server) — keep them identical.
11. **Stars are build sites with `site`-gated megastructures** (since June 2026): a `Planet` with `kind: 'star'` reuses all planet machinery (economy/queues/fog/combat) but is captured by a `unit:star-constructor` (not a colony ship) via `resolveStarCapture()`, and has shell slots from `createStarSlots()` (no surface zone). `BuildingDefinition.site` (`'planet' | 'star'`, default planet) gates placement in `validateTurnPlan` — megastructures (`bld:dyson-sphere` staged, `bld:matrioshka-brain`, `bld:orbital-shipyard-mega`, `bld:star-fortress`) only on stars, normal buildings only on planets. The client splits the catalog by site; the sun node opens `GameStarSlotView` (concentric shells + closing Dyson hull). `FACILITY_SUBSTITUTES` lets a completed stellar shipyard satisfy a `bld:orbital-dock` unit requirement (build ships on a star). `systemHasEnemyFortress()` makes a completed `bld:star-fortress` block enemy colonization/star-capture in its system (no siege mechanic yet).
12. **`updatePlanetsControlled()` runs AFTER `advanceQueues()`** in resolve, so `empireState` (`planetsControlled`, `starsControlled`, `dysonStages`) reflects buildings completed *this* turn. It feeds the ascension gates — **K2.0 = 1 star + 1 Dyson stage** (`requiresEmpire: { starsControlled, dysonStages }` in `research-tree.ts`, evaluated in `app/stores/research.ts`).
13. **Strategic resources are Civ-style** (since June 2026): defined in [shared/defs/strategicResources.ts](shared/defs/strategicResources.ts) (the single source tying resource ⇄ deposit `ResourceNodeType` ⇄ survey tech). They are **first-class entries in `player.resources`** but produced/spent via dedicated hooks, NOT the base `{energy, minerals, rare}` cost shape: `BuildingDefinition.strategicProduction` (extractor mines `amount × level` when its slot's `resourceNode` matches, via `calculateStrategicProduction`) and `strategicCosts` on buildings/units (consumed once on build). Discovery = research: a deposit's extractor is gated by its `surveyTech`, and the TopBar hides a strategic resource until the survey tech is done or you've mined some. Deposits are seeded in `initialState` by planet type (barren → exotic-matter, gas-giant → antimatter). Validation enforces affordability AND that an extractor sits on its matching deposit. To add a resource: extend `STRATEGIC_RESOURCES` + `ResourceNodeType`, add an extractor def + survey tech + i18n + a `STRATEGIC_ICONS`/`resourceMeta` entry.
14. **Victory runs last in resolve and ends the game** (since June 2026): `resolveVictory()` ([server/game/resolve/victory.ts](server/game/resolve/victory.ts)) runs AFTER `updatePlanetsControlled`. Shared `CONDITION_RULES` machinery: a player meeting a trigger starts a countdown on `GameSnapshot.victory.pending`; holding it `<condition>_HOLD_TURNS` declares `winnerId`; breaking it resets. All three paths exist as predicates in [shared/utils/victory.ts](shared/utils/victory.ts) (constants are **placeholders**, balanced in Phase 4): **Military** = owns every `isHomeworld` planet + `MILITARY_PLANET_THRESHOLD` planets; **Expansion** = holds ≥`EXPANSION_STAR_FRACTION` (0.9) of the stars in the player's **own home galaxy** (galaxy-scoped, NOT universe-wide); **Research** = completed `RESEARCH_VICTORY_TECH` (placeholder `tech:galactic-network` until the Phase-2 Temporal-Ascension capstone). `newTurn` passed in is `turn + 1` (the snapshot being written). On a win the orchestrator calls `repo.updateGameStatus(gameId, 'finished')`, and `submitTurn` rejects a `finished` game (409). Victory state rides the snapshot (no migration, redacted like the rest). Wins/countdowns are emitted to **every** player (`victory` / `victory-imminent` events) for multiplayer fairness. The client surfaces them via `GameVictoryBanner` + `GameVictoryOverlay`.

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

**Step 3 (tech-tree depth) is in progress.** First slice done (commits 35f924e, 3818fc3): **strategic resources** (exotic matter, antimatter) — discover via survey tech, mine on deposits, spend on Dyson/dreadnought (gotcha 13). Confirmed direction for the rest (all four principles): stars as a research gate, branching specializations with opportunity cost, techs that boost placement/synergies (not just unlock buildings), a stretched ladder, plus research-gated planet access and more resource variety. **Still to do:** restructure the `AscensionTier` ladder (short 0.6→2.0 on-ramp + stretched stellar era) and rebuild `TECH_DEFS` content into coherent branches — this is design-heavy and benefits from a review checkpoint with David before a full rewrite.

### Agreed phased roadmap (June 2026, David-approved)

After a full-state assessment: the foundation is clean and well-tested, but the
**game core is thin** at exactly the VISION weak spots, and **there is no victory
condition implemented at all** (the three wins / countdown / planet-cracker exist
nowhere — you can ascend tiers but cannot win). Priority order: *close & vision-align
the loop, then deepen.* (No effort estimates — David doesn't want them.)

- **Phase 0 — Quick wins.** ✅ `resolveTurn.ts` split into `server/game/resolve/*`
  modules (commit on branch `docs/navigation-combat-vision`). ⏸ Galaxy/universe map
  contrast **intentionally skipped** — the maps get rebuilt in Phase 3 (unified graph),
  so fixing the current rendering twice is wasted (David's call). Not a logic regress:
  GameCanvas + node-feeding code were unchanged; the imagery swap `8cfee53` is the last
  map-area change.
- **Phase 1 — Victory scaffold (highest leverage).** ✅ **Done — all three paths**
  (engine + UI). Generic `condition → countdown → hold` state machine in
  `resolve/victory.ts` (gotcha 14): Military, Expansion (≥90% of the **home galaxy's**
  stars), Research (capstone tech). `GameSnapshot.victory` carries countdowns + winner;
  game flips to `status: finished` and `submitTurn` rejects it; `GameVictoryBanner` +
  `GameVictoryOverlay` surface it. **Still open:** balance the placeholder constants,
  and replace the placeholder `RESEARCH_VICTORY_TECH` with a real Temporal-Ascension
  capstone in the Phase-2 tech rewrite; a "destroy the wonder" counter for Research
  comes with the combat work.
- **Phase 2 — Rebuild the tech tree** (current `TECH_DEFS` is a placeholder, may be
  discarded). Short on-ramp 0.6→2.0 + stretched 2.x band; remove `planetsControlled`
  gates; add `galaxyStarFraction` to `EmpireRequirement`. Real specialization with
  opportunity cost; **some planets only colonizable with the matching specialization**;
  techs unlock buildings/units **and give buffs** to them. Design checkpoint with David
  before the rewrite. **Playtest findings to fix here (June 2026):** *every research
  must have a felt effect* — today you start already owning buildings that still need
  research, and researching something often does nothing (already built, or needs a
  resource you can't get yet); rare material is gated so late the player is blocked for
  a long time. The resource model is reworked alongside the tree (more variety, earlier
  access, escalating costs — see below).
- **Phase 3 — Navigation & combat rework** (biggest open design — see VISION
  *Navigation & combat*): one unified node graph across all three levels (gateways,
  distances, speed, upgradable movement), edge-granular round-based combat (flee
  decisions, abilities, pinning). Plus the **planet-cracker** (siege tool + brutal win +
  disruptor of peaceful wins). **Planet terrain types** fold in here (tied to Phase-2
  specialization).
- **Phase 4 — Balance & polish**, once the loop is end-to-end playable (~80–120 turns).
  Megastructure values are placeholders; also a Star Fortress siege mechanic (currently
  an absolute block).

Critical path: Phase 0 split → Phase 1 Military win → Phase 2 checkpoint → Phase 3.

### Playtest feedback & backlog (June 2026, from David)

Captured from a hands-on playtest; slot these in around the phases above (most are
confirmed direction, not yet scheduled). Detail lives in memory ([[feedback_playtest-2026-06]]).

- ✅ **Civ-style production & placement UX** (done June 2026 — Phase B): the per-slot
  click flow is replaced by a side-list catalog (Buildings/Units tabs) + a **shared,
  ordered, multi-slot queue** with drag-reorder and per-item cancel. Picking a *unit*
  queues it; picking a *building* enters **placement mode** (valid slots highlight,
  hovering previews base yield + synergy/ore bonuses), click a slot to queue. Engine:
  unified `queues.production` + declarative `setProductionQueue` command +
  `reconcileProductionQueue` (gotcha 2). Up-front cost, drag-reorder, planets **and**
  stars. **Deferred follow-ups:** a possible pay-on-start cost model, per-queued-item
  robot-cost escalation tuning, and the **resource-type discussion** David wants (which
  new resources fit — keep energy/minerals/rare + robots-as-capacity, or add Civ-style
  strategic tiers) — do that before any new-resource work, alongside the Phase-2 tree.
- **Product shell & onboarding** (new workstream — make it feel like a PC game from the
  first moment, not a website): after login → a **main menu** (settings, start) → a
  **"Start game" submenu** with *Tutorial* / *Quick Play* (both greyed out for now) /
  *Custom Lobby* (= the current lobby flow). **Guests** get only Tutorial + Quick Play;
  **custom lobbies require a registered account**. Login itself is fine as is.
- **Quick fixes / bugs:** (1) a game can start **without picking a colour** yet everyone
  still gets one — make colour selection intentional or a clear default. (2) Worker/robot
  cost is **constant** → make it **escalate** per additional worker so production can't be
  ramped trivially (rising, but doubling is likely too harsh).
- **TopBar resource tooltips:** hovering a stat (e.g. energy) shows a **breakdown of where
  it comes from**. Small, early win; also useful for debugging.
- **PC-game feel / polish (later, but confirmed wanted):** more animations, **event
  sequences**, and **detailed end-of-game stats**. Still after gameplay depth — but these
  are now explicit product goals, not "maybe".
- **Dependency update (maintenance todo):** once the game basically stands, run the staged
  bump — safe minor/patch batch first, then `@nuxt/ui` + supabase CLI with verification,
  then the majors (pnpm 11, eslint 10, vitest 4 + test-utils 4, TS 6) one at a time. Full
  audit in [[project-dependency-update]].

**Explicitly out of scope right now:** hex map (the star-lane graph is the genre-idiomatic answer), asymmetric factions, diplomacy, trade, and any move off the Nuxt browser stack. *Animations / event sequences / end-game stats are deferred, not rejected* — confirmed wanted later (see the playtest backlog), just not before gameplay depth. Do not propose features outside the vision without checking first.

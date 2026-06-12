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
| [scripts/](scripts/) | Dev/test harnesses (seed users, playtest runner, etc.). |
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

1. **Tech tree currently unlocks nothing**. `BuildingDefinition.requirements.research` exists in the type but every entry in `BUILDING_DEFS` has `requirements: {}`. Research is decorative right now — known gap, on the roadmap.
2. **`isResume` semantics in resolve**: building the same building in the same slot keeps existing construction progress and does NOT re-deduct resources. Switching pays again. See `applyPlan()` in [resolveTurn.ts](server/game/resolveTurn.ts).
3. **`progressMemory`** stores per-build production progress so a cancelled or replaced build doesn't lose what was already invested. Lives on `Planet.progressMemory` (per-planet, per-buildId) and on `PlayerSnapshot.research.progressMemory` (per-tech).
4. **`productionCarryover`** rolls excess production from a completed build into the next turn's production pool on that planet.
5. **`Galaxy.connections` and `SolarSystem.connections` are defined but unused for fleet movement today.** Movement currently teleports.
6. **Game phase `resolving` is a transient lock.** Clients cannot submit or unsubmit while phase is `resolving`. Resolution is fast and atomic — phase flips back to `planning` after the snapshot is written.
7. **The `~~/` alias resolves at build time only**. Don't expect it inside string-based dynamic imports.
8. **Two `toPlayerId` implementations** exist (client + server) — keep them identical.

## Testing strategy

- **Unit tests** (`tests/...`) for pure functions in `shared/` — fast, no setup.
- **Integration tests** (`tests/server/...`) drive full turn cycles through `InMemoryGameRepository`. This is where most game-logic regressions get caught. Mirror the patterns in [tests/server/turn-cycle.test.ts](tests/server/turn-cycle.test.ts).
- **e2e/playtest** (`pnpm playtest`, specs in [scripts/playtest/](scripts/playtest/)) runs the real Nuxt app with two Playwright browser contexts as alice + bob through the full UI (login → lobby → game → end turn → resolution). Requires local Supabase running + seeded test users. Reuses a running `pnpm dev` server, otherwise starts one. Slow — reserve for golden paths. UI elements are addressed via `data-testid` attributes; when adding UI that the playtest must touch, add a testid rather than text selectors.

When adding game mechanics, write integration tests first using `InMemoryGameRepository`. The pattern: seed initial repo state, call `submitTurn` for each player, call `resolveTurn`, assert on the resulting snapshot.

## Where to look first

- **Adding a building/unit/tech**: edit the relevant array in [shared/defs/](shared/defs/). Add i18n keys in [i18n/locales/](i18n/locales/).
- **Changing turn resolution**: [server/game/resolveTurn.ts](server/game/resolveTurn.ts).
- **Changing what's in the initial game state**: [server/game/initialState.ts](server/game/initialState.ts).
- **Adding an API endpoint**: [server/api/](server/api/) — follow existing patterns (auth via `resolveUserId`, return `{ ... }`).
- **Adding a UI panel**: [app/components/game/](app/components/game/) — keep components dumb; data flows from [app/pages/game.vue](app/pages/game.vue).

## Current focus: roadmap to strategic depth

The MVP works (auth, lobby, turn engine, economy, research tree, multi-zoom map) but feels like an economy sim — there are no real stakes. Five moves, in order of leverage, before scope expands:

1. **Wire tech → unlocks.** `Building.requirements.research` is defined but unenforced. Map existing techs onto existing buildings (`tech:data-center-i` → `bld:data-center`, `tech:first-shipyard` → `bld:orbital-dock`, etc.) and enforce in validation. Cheapest fix, highest payoff — the tech tree becomes a real choice.
2. **Star-lane fleet movement.** Use the already-defined-but-unused `SolarSystem.connections` for graph-based travel. ETA = number of lanes; decrement per turn. No tactical/hex layer.
3. **Minimal combat.** When opposing fleets share a location: aggregate strength clash with a soft RPS multiplier between unit types. Loser destroyed, winner reduced. Conquest = capture undefended planet with a colonizer unit.
4. **Building synergies.** Use the existing surface/orbital slot zones plus `resourceNode` to add ~3–4 strong interactions (e.g. mining facility on ore node = 2× output, solar array adjacent to data center = +1 research). Not a full system.
5. **Dumb AI opponent.** Random-valid-move or simple heuristic. Unblocks solo playtesting — without it, every feature change needs two humans coordinating.

**Explicitly out of scope right now:** hex map (the genre-idiomatic answer is the star-lane graph, which is already half-built), asymmetric factions, diplomacy, trade, expanding the tech tree, animations/polish, and any move off the Nuxt browser stack. Do not propose features outside the five above without checking first.

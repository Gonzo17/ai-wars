# Copilot instructions

## Project overview
- Nuxt 4 + Vue 3 + TypeScript app in app/; server routes live in server/api (Nitro).
- Shared game domain lives in shared/ (types, defs, validation) and is imported by both client and server.
- Supabase is the backend; server routes use service-role clients for DB access and auth lookups.

## Architecture & data flow
- Client game UI builds a `TurnPlan` and validates locally via [shared/validation/turnPlan.ts](shared/validation/turnPlan.ts). See [app/pages/game.vue](app/pages/game.vue).
- Turn submission hits [server/api/games/[id]/turn.post.ts](server/api/games/%5Bid%5D/turn.post.ts) which calls `submitTurn()` in [server/game/turn.ts](server/game/turn.ts).
- `submitTurn()` stores the plan, marks the player ready, and triggers `resolveTurn()` in [server/game/resolveTurn.ts](server/game/resolveTurn.ts).
- `resolveTurn()` applies all plans in order, advances research/queues, inserts the next snapshot, and bumps the game turn via the repository.
- `GameRepository` defines the data boundary in [server/game/repository.ts](server/game/repository.ts) with Supabase and in-memory implementations in [server/game/supabaseRepository.ts](server/game/supabaseRepository.ts) and [server/game/inMemoryRepository.ts](server/game/inMemoryRepository.ts).
- Game snapshots and IDs come from [shared/types/game.ts](shared/types/game.ts) and are created in [server/game/initialState.ts](server/game/initialState.ts).

## Supabase integration
- API handlers authenticate with `resolveUserId()` in [server/utils/resolveUserId.ts](server/utils/resolveUserId.ts).
- Client uses `useAuthFetch()` to attach bearer tokens for server API calls; see [app/composables/useAuthFetch.ts](app/composables/useAuthFetch.ts).
- Realtime updates for game phase/ready state are wired in [app/pages/game.vue](app/pages/game.vue) via `supabase.channel()`.

## Conventions & patterns
- Use the `~~/` alias for root imports (shared, server, app).
- Keep validation logic in shared/validation so client and server stay consistent.
- Convert Supabase user IDs to player IDs via `toPlayerId()`; see [shared/utils/playerId.ts](shared/utils/playerId.ts) and [server/game/playerId.ts](server/game/playerId.ts).
- Game definitions (buildings, units, techs) live in shared/defs and are read by both UI and server logic.

## Developer workflows
- Run the app: `pnpm dev`. Build: `pnpm build`. Preview: `pnpm preview`.
- Lint: `pnpm lint`. Typecheck: `pnpm typecheck`. Tests: `pnpm test` (Vitest).
- Supabase CLI is used for local DB and types. Generate types with `pnpm supabase:types` into [app/types/database.types.ts](app/types/database.types.ts). Migrations live in supabase/migrations.

## Tests
- Server logic tests live under tests/server and use the in-memory repository.
- Store tests live under tests/stores.

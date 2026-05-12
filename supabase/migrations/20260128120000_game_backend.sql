create table if not exists public.games (
  id uuid default gen_random_uuid() not null,
  created_by uuid not null,
  status text not null default 'active',
  turn integer not null default 1,
  phase text not null default 'planning',
  resolving_turn integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint games_pkey primary key (id),
  constraint games_status_check check (status in ('active', 'finished')),
  constraint games_phase_check check (phase in ('planning', 'resolving')),
  constraint games_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade
);

create table if not exists public.game_players (
  game_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz default now(),
  constraint game_players_pkey primary key (game_id, user_id),
  constraint game_players_game_id_fkey foreign key (game_id) references public.games (id) on delete cascade,
  constraint game_players_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

create table if not exists public.turn_plans (
  game_id uuid not null,
  turn integer not null,
  user_id uuid not null,
  plan_json jsonb not null,
  submitted_at timestamptz,
  constraint turn_plans_pkey primary key (game_id, turn, user_id),
  constraint turn_plans_game_id_fkey foreign key (game_id) references public.games (id) on delete cascade,
  constraint turn_plans_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

create table if not exists public.game_state (
  game_id uuid not null,
  turn integer not null,
  state_json jsonb not null,
  created_at timestamptz default now(),
  constraint game_state_pkey primary key (game_id, turn),
  constraint game_state_game_id_fkey foreign key (game_id) references public.games (id) on delete cascade
);

alter table public.lobbies add column if not exists game_id uuid;

update public.lobbies set status = 'open' where status in ('waiting', 'starting');

alter table public.lobbies alter column status set default 'open';

alter table public.lobbies drop constraint if exists lobbies_status_check;

alter table public.lobbies add constraint lobbies_status_check check (status in ('open', 'started', 'closed'));

alter table public.lobbies add constraint lobbies_game_id_fkey foreign key (game_id) references public.games (id) on delete set null;

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.turn_plans enable row level security;
alter table public.game_state enable row level security;

create policy "read games" on public.games for select using (
  exists (
    select 1 from public.game_players gp
    where gp.game_id = games.id and gp.user_id = auth.uid()
  )
);

create policy "read game players" on public.game_players for select using (
  exists (
    select 1 from public.game_players gp
    where gp.game_id = game_players.game_id and gp.user_id = auth.uid()
  )
);

create policy "read turn plans" on public.turn_plans for select using (
  exists (
    select 1 from public.game_players gp
    where gp.game_id = turn_plans.game_id and gp.user_id = auth.uid()
  )
);

create policy "read game state" on public.game_state for select using (
  exists (
    select 1 from public.game_players gp
    where gp.game_id = game_state.game_id and gp.user_id = auth.uid()
  )
);

create policy "service write games" on public.games for insert with check (auth.role() = 'service_role');
create policy "service update games" on public.games for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service delete games" on public.games for delete using (auth.role() = 'service_role');

create policy "service write game players" on public.game_players for insert with check (auth.role() = 'service_role');
create policy "service update game players" on public.game_players for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service delete game players" on public.game_players for delete using (auth.role() = 'service_role');

create policy "service write turn plans" on public.turn_plans for insert with check (auth.role() = 'service_role');
create policy "service update turn plans" on public.turn_plans for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service delete turn plans" on public.turn_plans for delete using (auth.role() = 'service_role');

create policy "service write game state" on public.game_state for insert with check (auth.role() = 'service_role');
create policy "service update game state" on public.game_state for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service delete game state" on public.game_state for delete using (auth.role() = 'service_role');

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.turn_plans;
alter publication supabase_realtime add table public.game_state;

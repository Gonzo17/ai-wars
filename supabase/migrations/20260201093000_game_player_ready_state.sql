alter table public.game_players
  add column if not exists ready_turn integer,
  add column if not exists ready_at timestamptz;

create index if not exists game_players_ready_turn_idx
  on public.game_players (game_id, ready_turn);
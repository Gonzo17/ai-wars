-- Player colours: chosen in the lobby, carried into the game for map ownership rings.

alter table public.lobby_players add column if not exists color text;
alter table public.game_players add column if not exists color text;

-- Let a player set their own colour on their lobby row (insert/delete policies
-- already exist; there was no update policy until now).
drop policy if exists "update own lobby player" on public.lobby_players;
create policy "update own lobby player" on public.lobby_players
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

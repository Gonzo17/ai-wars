create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id and gp.user_id = auth.uid()
  );
$$;

alter policy "read games" on public.games using (public.is_game_member(id));
alter policy "read game players" on public.game_players using (public.is_game_member(game_players.game_id));
alter policy "read turn plans" on public.turn_plans using (public.is_game_member(turn_plans.game_id));
alter policy "read game state" on public.game_state using (public.is_game_member(game_state.game_id));

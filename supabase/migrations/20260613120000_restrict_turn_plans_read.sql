-- Fog of war: a player must not be able to read another player's submitted
-- turn plan before resolution. Turn resolution runs via the service role and
-- bypasses RLS, so restricting member SELECT to their own rows is safe.
alter policy "read turn plans" on public.turn_plans
  using (user_id = auth.uid());

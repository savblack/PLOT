-- brevo_sync_state has RLS on and no policy. It is already closed to the app
-- (anon and authenticated have no grants, and with no policy RLS denies every
-- row), but the advisor flags it as unfinished. Say it out loud: nobody on the
-- client reads or writes this table. The service role bypasses RLS, and the
-- trigger that marks users dirty is security definer, so neither is affected.

drop policy if exists "brevo sync state is server only" on public.brevo_sync_state;
create policy "brevo sync state is server only" on public.brevo_sync_state
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

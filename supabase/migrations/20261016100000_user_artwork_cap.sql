-- The insert policy counted user_artwork from inside a user_artwork policy.
-- Postgres rejects that as infinite recursion, so the first save never lands
-- and the sheet stays on the busy state. The cap moves to a trigger. The
-- trigger function is security definer, so the count is not subject to the
-- policies on this table. Identity and Premium stay on the insert policy.
--
-- 20261015130000 was already home_layout on production, so the first copy of
-- this change never ran. This version sorts after import_jobs_queue.

create or replace function public.enforce_user_artwork_cap()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    return new;
  end if;
  -- One writer at a time per account, so two saves cannot both pass a cap of 1999.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 9186));
  if (select count(*) from public.user_artwork where user_id = new.user_id) >= 2000 then
    raise exception using errcode = 'P0001', message = 'artwork_limit_reached';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_user_artwork_cap() from public, anon, authenticated;

drop trigger if exists enforce_user_artwork_cap on public.user_artwork;
create trigger enforce_user_artwork_cap
  before insert on public.user_artwork
  for each row execute function public.enforce_user_artwork_cap();

drop policy if exists "own artwork insertable" on public.user_artwork;
create policy "own artwork insertable" on public.user_artwork
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_premium()
  );

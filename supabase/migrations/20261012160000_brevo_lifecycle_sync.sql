-- Brevo lifecycle sync.
--
-- Triggers only mark a row dirty, and not more than once every 15 minutes.
-- The hourly job (brevo-lifecycle) is what talks to Brevo, and it skips a
-- contact it already pushed in the last hour. Episode ticks therefore do not
-- each become an API call.
--
-- onboarding_completed is not sent from this migration. The client sets
-- onboarding_event_pending after onboarding finishes. The edge function
-- claims that flag. Old accounts stay quiet, so turning the cron on cannot
-- mail the existing base.

create table public.brevo_sync_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  dirty_at timestamptz,
  synced_at timestamptz,
  onboarding_event_at timestamptz,
  onboarding_event_pending boolean not null default false,
  imported boolean not null default false,
  last_seen_at timestamptz
);

alter table public.brevo_sync_state enable row level security;
revoke all on public.brevo_sync_state from anon, authenticated;

create index brevo_sync_state_dirty_idx
  on public.brevo_sync_state (dirty_at)
  where dirty_at is not null;

create index brevo_sync_state_pending_idx
  on public.brevo_sync_state (user_id)
  where onboarding_event_pending and onboarding_event_at is null;

-- Trigger function. Postgres does not check the session user's EXECUTE when
-- a trigger calls this, so authenticated does not need a grant.
create or replace function public.brevo_mark_dirty()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  if uid is null then
    return coalesce(new, old);
  end if;

  insert into public.brevo_sync_state (user_id, dirty_at)
  values (uid, now())
  on conflict (user_id) do update
    set dirty_at = now()
    where public.brevo_sync_state.dirty_at is null
       or public.brevo_sync_state.dirty_at < now() - interval '15 minutes';

  return coalesce(new, old);
end;
$fn$;

revoke all on function public.brevo_mark_dirty() from public, anon, authenticated;

drop trigger if exists brevo_history_dirty on public.history;
create trigger brevo_history_dirty
  after insert or delete or update of watched_at, rating, dnf, note
  on public.history
  for each row execute function public.brevo_mark_dirty();

drop trigger if exists brevo_watching_dirty on public.watching_progress;
create trigger brevo_watching_dirty
  after insert or update or delete
  on public.watching_progress
  for each row execute function public.brevo_mark_dirty();

-- streaming_date is refreshed by a job. Leave it out so that job does not
-- dirty every saved title on its own schedule.
drop trigger if exists brevo_list_items_dirty on public.list_items;
create trigger brevo_list_items_dirty
  after insert or delete or update of title, poster_path, tmdb_id, media_type
  on public.list_items
  for each row execute function public.brevo_mark_dirty();

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if uid is null then
    return;
  end if;

  insert into public.brevo_sync_state (user_id, last_seen_at, dirty_at)
  values (uid, now(), now())
  on conflict (user_id) do update
    set last_seen_at = now(),
        dirty_at = case
          when public.brevo_sync_state.dirty_at is not null
           and public.brevo_sync_state.dirty_at >= now() - interval '15 minutes'
          then public.brevo_sync_state.dirty_at
          else now()
        end
    where public.brevo_sync_state.last_seen_at is null
       or public.brevo_sync_state.last_seen_at < day_start;
end;
$fn$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

create or replace function public.mark_brevo_imported()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  insert into public.brevo_sync_state (user_id, imported, dirty_at)
  values (uid, true, now())
  on conflict (user_id) do update
    set imported = true,
        dirty_at = now()
    where not public.brevo_sync_state.imported;
end;
$fn$;

revoke all on function public.mark_brevo_imported() from public, anon;
grant execute on function public.mark_brevo_imported() to authenticated;

-- Sets the flag the cron drains. Does not send anything.
create or replace function public.request_brevo_onboarding_event()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  insert into public.brevo_sync_state (user_id, onboarding_event_pending)
  values (uid, true)
  on conflict (user_id) do update
    set onboarding_event_pending = true
    where public.brevo_sync_state.onboarding_event_at is null;
end;
$fn$;

revoke all on function public.request_brevo_onboarding_event() from public, anon;
grant execute on function public.request_brevo_onboarding_event() to authenticated;

create or replace function public.claim_brevo_onboarding_event(uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  got boolean;
begin
  if uid is null then
    return false;
  end if;

  insert into public.brevo_sync_state (user_id, onboarding_event_pending)
  values (uid, true)
  on conflict (user_id) do update
    set onboarding_event_pending = true
    where public.brevo_sync_state.onboarding_event_at is null;

  update public.brevo_sync_state
    set onboarding_event_at = now(),
        onboarding_event_pending = false
    where user_id = uid
      and onboarding_event_at is null
    returning true into got;

  return coalesce(got, false);
end;
$fn$;

revoke all on function public.claim_brevo_onboarding_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_brevo_onboarding_event(uuid) to service_role;

-- Call after a claimed send fails with a retryable Brevo status. A 400 stays
-- claimed so a bad payload is not retried every hour.
create or replace function public.release_brevo_onboarding_event(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.brevo_sync_state
    set onboarding_event_at = null,
        onboarding_event_pending = true
    where user_id = uid;
end;
$fn$;

revoke all on function public.release_brevo_onboarding_event(uuid) from public, anon, authenticated;
grant execute on function public.release_brevo_onboarding_event(uuid) to service_role;

-- plpgsql so CREATE does not require history to exist at parse time.
-- Movie and TV ids are different titles even when the number matches.
create or replace function public.brevo_tracking_snapshot(uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  result jsonb;
begin
  with stamps as (
    select
      (
        case
          when h.media_type in ('tv', 'show', 'series') then 'tv'
          when h.media_type = 'movie' then 'movie'
          else null
        end || ':' || h.tmdb_id::text
      ) as key,
      coalesce(h."updatedAt", h.watched_at, h.created_at) as at
    from public.history h
    where h.user_id = uid
      and (
        h.watched_at is not null
        or h.rating is not null
        or h.dnf is true
        or nullif(btrim(coalesce(h.note, '')), '') is not null
      )
    union all
    select
      ('tv:' || wp.tmdb_id::text) as key,
      coalesce(wp.updated_at, wp.started_at) as at
    from public.watching_progress wp
    where wp.user_id = uid
  )
  select jsonb_build_object(
    'track_count', count(distinct key) filter (where key is not null),
    'last_track_at', max(at) filter (where key is not null)
  )
  into result
  from stamps;

  return coalesce(result, jsonb_build_object('track_count', 0, 'last_track_at', null));
end;
$fn$;

revoke all on function public.brevo_tracking_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.brevo_tracking_snapshot(uuid) to service_role;

create or replace function public.brevo_watchlist_snapshot(uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  found_list uuid;
  total integer;
  titles jsonb;
begin
  select l.id into found_list
  from public.lists l
  where l.user_id = uid
    and l.name = 'My List'
  limit 1;

  if found_list is null then
    return jsonb_build_object('count', 0, 'titles', '[]'::jsonb);
  end if;

  select count(*) into total
  from public.list_items li
  where li.list_id = found_list;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title', picked.title,
        'poster_path', picked.poster_path,
        'tmdb_id', picked.tmdb_id,
        'media_type', picked.media_type
      )
      order by picked.created_at desc nulls last
    ),
    '[]'::jsonb
  )
  into titles
  from (
    select li.title, li.poster_path, li.tmdb_id, li.media_type, li.created_at
    from public.list_items li
    where li.list_id = found_list
    order by li.created_at desc nulls last
    limit 3
  ) picked;

  return jsonb_build_object('count', coalesce(total, 0), 'titles', titles);
end;
$fn$;

revoke all on function public.brevo_watchlist_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.brevo_watchlist_snapshot(uuid) to service_role;

-- Folds recent sign-ins into last_seen for clients that have not called
-- touch_last_seen. No profiles read: a missing profile hits the foreign key
-- and that one row is skipped.
create or replace function public.brevo_note_recent_signins()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  noted integer := 0;
  rec record;
begin
  for rec in
    select id, last_sign_in_at
    from auth.users
    where last_sign_in_at > now() - interval '36 hours'
  loop
    begin
      insert into public.brevo_sync_state (user_id, last_seen_at, dirty_at)
      values (rec.id, rec.last_sign_in_at, now())
      on conflict (user_id) do update
        set last_seen_at = excluded.last_seen_at,
            dirty_at = case
              when public.brevo_sync_state.dirty_at is not null
               and public.brevo_sync_state.dirty_at >= now() - interval '15 minutes'
              then public.brevo_sync_state.dirty_at
              else now()
            end
        where public.brevo_sync_state.last_seen_at is null
           or excluded.last_seen_at > public.brevo_sync_state.last_seen_at + interval '20 hours';

      if found then
        noted := noted + 1;
      end if;
    exception
      when foreign_key_violation then
        null;
    end;
  end loop;

  return noted;
end;
$fn$;

revoke all on function public.brevo_note_recent_signins() from public, anon, authenticated;
grant execute on function public.brevo_note_recent_signins() to service_role;

create or replace function public.run_brevo_lifecycle_sync()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bearer text;
  base_url text;
begin
  select decrypted_secret into bearer
    from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_webhook_base_url';

  if bearer is null or base_url is null then
    raise warning 'run_brevo_lifecycle_sync: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/brevo-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$fn$;

revoke all on function public.run_brevo_lifecycle_sync() from public, anon, authenticated;

comment on function public.run_brevo_lifecycle_sync() is
  'Calls the brevo-lifecycle Edge Function. Bearer and base URL come from Vault.';

-- 17 minutes past the hour, off the other top-of-hour jobs.
do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling brevo-lifecycle-sync';
    return;
  end if;

  perform cron.unschedule('brevo-lifecycle-sync')
    where exists (select 1 from cron.job where jobname = 'brevo-lifecycle-sync');

  perform cron.schedule(
    'brevo-lifecycle-sync',
    '17 * * * *',
    $cron$select public.run_brevo_lifecycle_sync()$cron$
  );
end
$do$;

-- watching_progress.last_activity_at: when the user last did something with
-- a show outside its episode pointer.
--
-- Watching is ordered "last watched first": the later of the pointer moving
-- (updated_at) and any of
--   - an imported or synced episode landing (watch_events, tv),
--   - an episode ticked on the title page (episode_watch_overrides, watched),
--   - the show being logged in History (history, tv).
-- Until now the client read those three tables itself
-- (packages/core/watchingActivity.js). They are owner-only under RLS, so a
-- visitor to a public profile could order by updated_at alone. This column is
-- readable wherever the pointer row is, so both views order the same way.
--
-- The column holds outside activity only, not the pointer's time. Undoing a
-- tick writes the old updated_at back (20261110140000); folding pointer moves
-- in here would make that undo unable to move the show back. Readers take
-- greatest(updated_at, last_activity_at) (packages/core/watchingOrder.js).
--
-- Every time written here is the server's now(). The client can insert
-- watch_events.created_at itself, so a stored source time is only used by the
-- backfill and the insert lookup, both clamped to now().
--
-- Load (production ran out of disk IO on 2026-11-10, 20261110120000): the
-- watch_events and history triggers are statement-level with transition
-- tables, so a bulk insert does one update per show, not one per row. The
-- import RPCs (import_watch_events, the tracking job writer) insert one row
-- per statement in a loop of up to 50, so there the trigger fires per row;
-- but now() is fixed for the transaction, and every update skips a pointer
-- row that already has now(), so each show is written once per call and the
-- other fires are a single index read. last_activity_at is not indexed, so
-- the writes can be HOT updates.
--
-- Columns named in the bodies below were checked against later migrations
-- for `drop column` (AGENTS.md): watch_events.media_type/created_at,
-- episode_watch_overrides.watched/updated_at, history.media_type/created_at
-- are all live.
--
-- redefines: update_watching_progress_updated_at (adds lines only: an update
-- that changes nothing but last_activity_at keeps updated_at, and a future
-- last_activity_at is clamped to now()). Body otherwise identical to
-- 20261110140000, diffed with db:function-diff.

alter table public.watching_progress add column last_activity_at timestamptz;

comment on column public.watching_progress.last_activity_at is
  'Latest outside activity for this show (import, title-page tick, History log), server time. Not the pointer: order by greatest(updated_at, last_activity_at).';

-- ── The pointer's own trigger ──────────────────────────────────────────────
-- Without the early return, the triggers below would stamp updated_at = now()
-- on every activity update, which is the pointer time and must not move.
create or replace function public.update_watching_progress_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.last_activity_at > now() then
    new.last_activity_at = now();
  end if;
  if new.last_activity_at is distinct from old.last_activity_at
     and new.updated_at is not distinct from old.updated_at
     and to_jsonb(new) - 'last_activity_at' = to_jsonb(old) - 'last_activity_at' then
    return new;
  end if;
  if new.updated_at is not distinct from old.updated_at
     or new.updated_at is null
     or new.updated_at > now() then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- ── A new pointer row picks up activity that came first ────────────────────
-- Logging a show in History and then starting it, or stopping and restarting
-- it, must not reset its place. Three index lookups per inserted row
-- (watch_events_user_title, episode_watch_overrides' unique key,
-- history_user_id_tmdb_id_media_type_key). The client's value is ignored.
create function public.set_watching_progress_last_activity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  seen timestamptz;
begin
  select greatest(
    (select max(e.created_at) from public.watch_events e
      where e.user_id = new.user_id and e.tmdb_id = new.tmdb_id and e.media_type = 'tv'),
    (select max(o.updated_at) from public.episode_watch_overrides o
      where o.user_id = new.user_id and o.tmdb_id = new.tmdb_id and o.watched),
    (select max(h.created_at) from public.history h
      where h.user_id = new.user_id and h.tmdb_id = new.tmdb_id and h.media_type = 'tv')
  ) into seen;
  new.last_activity_at = case when seen > now() then now() else seen end;
  return new;
end;
$$;

create trigger watching_progress_last_activity
  before insert on public.watching_progress
  for each row execute function public.set_watching_progress_last_activity();

-- ── Outside activity moves it ──────────────────────────────────────────────
-- security invoker: a user's own insert updates only their own pointer rows,
-- which RLS already allows; the service role and security definer RPCs
-- bypass RLS as before.

create function public.watching_activity_from_watch_events()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.watching_progress wp
     set last_activity_at = now()
    from (select distinct n.user_id, n.tmdb_id from new_rows n where n.media_type = 'tv') s
   where wp.user_id = s.user_id and wp.tmdb_id = s.tmdb_id
     and (wp.last_activity_at is null or wp.last_activity_at < now());
  return null;
end;
$$;

create trigger watch_events_watching_activity
  after insert on public.watch_events
  referencing new table as new_rows
  for each statement execute function public.watching_activity_from_watch_events();

-- Postgres allows a transition table only on a single-event trigger, so the
-- upsert's insert and update paths get one trigger each.
create function public.watching_activity_from_episode_overrides()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.watching_progress wp
     set last_activity_at = now()
    from (select distinct n.user_id, n.tmdb_id from new_rows n where n.watched) s
   where wp.user_id = s.user_id and wp.tmdb_id = s.tmdb_id
     and (wp.last_activity_at is null or wp.last_activity_at < now());
  return null;
end;
$$;

create trigger episode_watch_overrides_watching_activity_insert
  after insert on public.episode_watch_overrides
  referencing new table as new_rows
  for each statement execute function public.watching_activity_from_episode_overrides();

create trigger episode_watch_overrides_watching_activity_update
  after update on public.episode_watch_overrides
  referencing new table as new_rows
  for each statement execute function public.watching_activity_from_episode_overrides();

-- A History log is an insert: history is one row per title
-- (history_user_id_tmdb_id_media_type_key), and edits to an existing log are
-- not new activity, the same rule the client applied (history.created_at).
create function public.watching_activity_from_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.watching_progress wp
     set last_activity_at = now()
    from (select distinct n.user_id, n.tmdb_id from new_rows n where n.media_type = 'tv') s
   where wp.user_id = s.user_id and wp.tmdb_id = s.tmdb_id
     and (wp.last_activity_at is null or wp.last_activity_at < now());
  return null;
end;
$$;

create trigger history_watching_activity
  after insert on public.history
  referencing new table as new_rows
  for each statement execute function public.watching_activity_from_history();

-- Trigger functions are not callable over PostgREST (20261012130000). The
-- triggers still fire: Postgres does not check EXECUTE for trigger calls.
revoke execute on function public.set_watching_progress_last_activity() from public, anon, authenticated;
revoke execute on function public.watching_activity_from_watch_events() from public, anon, authenticated;
revoke execute on function public.watching_activity_from_episode_overrides() from public, anon, authenticated;
revoke execute on function public.watching_activity_from_history() from public, anon, authenticated;

-- ── One-time backfill ──────────────────────────────────────────────────────
-- One statement, index lookups per pointer row (no scan of watch_events).
-- The pointer's two update triggers are off for it: updated_at must not move,
-- and marking every user dirty for Brevo would queue a full resync for a
-- change Brevo does not read. Same transaction, so nothing else sees them off.
alter table public.watching_progress disable trigger watching_progress_updated_at;
alter table public.watching_progress disable trigger brevo_watching_dirty;

update public.watching_progress wp
   set last_activity_at = least(a.seen, now())
  from public.watching_progress p
  cross join lateral (
    select greatest(
      (select max(e.created_at) from public.watch_events e
        where e.user_id = p.user_id and e.tmdb_id = p.tmdb_id and e.media_type = 'tv'),
      (select max(o.updated_at) from public.episode_watch_overrides o
        where o.user_id = p.user_id and o.tmdb_id = p.tmdb_id and o.watched),
      (select max(h.created_at) from public.history h
        where h.user_id = p.user_id and h.tmdb_id = p.tmdb_id and h.media_type = 'tv')
    ) as seen
  ) a
 where wp.id = p.id
   and a.seen is not null;

alter table public.watching_progress enable trigger watching_progress_updated_at;
alter table public.watching_progress enable trigger brevo_watching_dirty;

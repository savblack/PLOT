-- watching_progress.last_activity_at: when the user last did something with
-- a show outside its episode pointer.
--
-- Watching is ordered "last watched first": the later of the pointer moving
-- (updated_at) and the latest of
--   - an imported or synced episode (watch_events.created_at, tv),
--   - an episode ticked on the title page (episode_watch_overrides.updated_at,
--     watched only),
--   - the show's History log (history.created_at, tv).
-- Until now the client read those three tables itself
-- (packages/core/watchingActivity.js). They are owner-only under RLS, so a
-- visitor to a public profile could order by updated_at alone. This column is
-- readable wherever the pointer row is, so both views order the same way.
--
-- The column is recomputed from those sources, not pushed forward, so it keeps
-- the client's old rules exactly: un-ticking an episode, deleting a History
-- log or deleting an imported event moves the show back to where its
-- remaining activity puts it. Times are clamped to now(), because the client
-- can insert watch_events.created_at and history.created_at itself.
--
-- The column holds outside activity only, not the pointer's time. Undoing a
-- tick writes the old updated_at back (20261110140000); folding pointer moves
-- in here would make that undo unable to move the show back. Readers take
-- greatest(updated_at, last_activity_at) (packages/core/watchingOrder.js).
--
-- Load (production ran out of disk IO on 2026-11-10, 20261110120000): the
-- triggers are statement-level with transition tables, so a bulk insert or
-- delete recomputes each affected show once, not once per row. The import
-- RPCs (import_watch_events, the tracking job writer) insert one row per
-- statement in a loop of up to 50, so there the trigger fires per row; each
-- fire is three index reads for one show, and the update is skipped when the
-- value would not change, so each show is written once per call.
-- last_activity_at is not indexed, so the writes can be HOT updates.
--
-- The trigger functions are security definer so that they can call the
-- private helper below; they only touch pointer rows named by the rows the
-- statement itself wrote or deleted, which RLS already limited to the caller.
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

-- Fail fast rather than queue behind a long reader: a waiting ACCESS
-- EXCLUSIVE lock on watching_progress would block every read of Watching
-- until it is granted. A failed apply can simply be re-run.
set local lock_timeout = '5s';

alter table public.watching_progress add column last_activity_at timestamptz;

comment on column public.watching_progress.last_activity_at is
  'Latest outside activity for this show (import, title-page tick, History log), server time, recomputed from those tables. Not the pointer: order by greatest(updated_at, last_activity_at).';

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

-- ── The rule, in one place ─────────────────────────────────────────────────
-- Three index lookups: watch_events_user_title, episode_watch_overrides'
-- unique key, history_user_id_tmdb_id_media_type_key. Private: only the
-- definer trigger functions below call it.
create function public.watching_activity_for(p_user uuid, p_tmdb integer)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when seen > now() then now() else seen end
  from (
    select greatest(
      (select max(e.created_at) from public.watch_events e
        where e.user_id = p_user and e.tmdb_id = p_tmdb and e.media_type = 'tv'),
      (select max(o.updated_at) from public.episode_watch_overrides o
        where o.user_id = p_user and o.tmdb_id = p_tmdb and o.watched),
      (select max(h.created_at) from public.history h
        where h.user_id = p_user and h.tmdb_id = p_tmdb and h.media_type = 'tv')
    ) as seen
  ) s;
$$;

-- ── A new pointer row picks up activity that came first ────────────────────
-- Logging a show in History and then starting it, or stopping and restarting
-- it, must not reset its place. The client's value is ignored. A row for
-- another user is still refused by RLS's check, which runs after this.
create function public.set_watching_progress_last_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.last_activity_at = public.watching_activity_for(new.user_id, new.tmdb_id);
  return new;
end;
$$;

create trigger watching_progress_last_activity
  before insert on public.watching_progress
  for each row execute function public.set_watching_progress_last_activity();

-- ── Outside activity recomputes it ─────────────────────────────────────────
-- One function for all three tables. Only the branch for this TG_OP is
-- planned, so each trigger names just the transition table it declares.
-- episode_watch_overrides has no media_type and every row is a tv episode.
create function public.refresh_watching_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.watching_progress wp
       set last_activity_at = a.at
      from (select distinct r.user_id, r.tmdb_id from old_rows r
             where coalesce(to_jsonb(r)->>'media_type', 'tv') = 'tv') s
      cross join lateral (select public.watching_activity_for(s.user_id, s.tmdb_id) as at) a
     where wp.user_id = s.user_id and wp.tmdb_id = s.tmdb_id
       and wp.last_activity_at is distinct from a.at;
  else
    update public.watching_progress wp
       set last_activity_at = a.at
      from (select distinct r.user_id, r.tmdb_id from new_rows r
             where coalesce(to_jsonb(r)->>'media_type', 'tv') = 'tv') s
      cross join lateral (select public.watching_activity_for(s.user_id, s.tmdb_id) as at) a
     where wp.user_id = s.user_id and wp.tmdb_id = s.tmdb_id
       and wp.last_activity_at is distinct from a.at;
  end if;
  return null;
end;
$$;

-- Postgres allows a transition table only on a single-event trigger, hence
-- one trigger per event. An upsert fires both the insert and update ones.
create trigger watch_events_activity_insert
  after insert on public.watch_events
  referencing new table as new_rows
  for each statement execute function public.refresh_watching_activity();
create trigger watch_events_activity_delete
  after delete on public.watch_events
  referencing old table as old_rows
  for each statement execute function public.refresh_watching_activity();

create trigger episode_watch_overrides_activity_insert
  after insert on public.episode_watch_overrides
  referencing new table as new_rows
  for each statement execute function public.refresh_watching_activity();
create trigger episode_watch_overrides_activity_update
  after update on public.episode_watch_overrides
  referencing new table as new_rows
  for each statement execute function public.refresh_watching_activity();
create trigger episode_watch_overrides_activity_delete
  after delete on public.episode_watch_overrides
  referencing old table as old_rows
  for each statement execute function public.refresh_watching_activity();

-- Edits to an existing History log are not new activity (the client used
-- history.created_at), so there is no update trigger here.
create trigger history_activity_insert
  after insert on public.history
  referencing new table as new_rows
  for each statement execute function public.refresh_watching_activity();
create trigger history_activity_delete
  after delete on public.history
  referencing old table as old_rows
  for each statement execute function public.refresh_watching_activity();

-- None of these are callable over PostgREST. Triggers still fire: Postgres
-- does not check EXECUTE for trigger calls, and the definer functions run as
-- their owner when they call the helper.
revoke execute on function public.watching_activity_for(uuid, integer) from public, anon, authenticated;
revoke execute on function public.set_watching_progress_last_activity() from public, anon, authenticated;
revoke execute on function public.refresh_watching_activity() from public, anon, authenticated;

-- ── One-time backfill ──────────────────────────────────────────────────────
-- One statement, index lookups per pointer row (no scan of watch_events).
-- updated_at does not move: the pointer trigger's early return covers an
-- update of last_activity_at alone. The Brevo trigger is off for this
-- statement so every user is not queued for a resync over a column Brevo does
-- not read; this file runs in one transaction, so nothing else sees it off.
alter table public.watching_progress disable trigger brevo_watching_dirty;

update public.watching_progress wp
   set last_activity_at = a.at
  from (
    select p.id, public.watching_activity_for(p.user_id, p.tmdb_id) as at
    from public.watching_progress p
  ) a
 where wp.id = a.id
   and a.at is not null;

alter table public.watching_progress enable trigger brevo_watching_dirty;

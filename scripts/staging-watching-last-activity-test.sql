-- Prove that a History log, a title-page episode tick and an import each move
-- watching_progress.last_activity_at, that undoing them (un-tick, deleting
-- the log or the events) moves it back, and that a visitor to a public
-- profile reads it and gets the owner's "last watched" order.
--
--   set -a; . .env; set +a
--   pnpm run staging:watching-last-activity-test
--
-- WHY: the other activity sources are owner-only under RLS, so the public
-- profile could order by the pointer time alone. The fix is
-- supabase/migrations/20261111100000_watching_progress_last_activity.sql.
-- Unit tests cannot run triggers; this does.
--
-- Every write goes through RLS as fixture account A (auth.uid()), the way the
-- app writes. Everything, including the migration, is in one transaction
-- ending in rollback, so Staging is unchanged whether this passes or dies.
--
-- now() is fixed for a transaction, so "moved" means last_activity_at = now().
--
-- 2147483647 down to 2147483644 are not TMDB ids (AGENTS.md: never guess
-- one); watch_events and episode_watch_overrides require tmdb_id > 0.
--   X 2147483647  History, ticks, imports
--   Y 2147483646  started after an earlier History log
--   Z 2147483645  movie log, device clock
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''
\set OLD '''2026-01-01T00:00:00Z'''
\set X 2147483647
\set Y 2147483646
\set Z 2147483645

begin;

-- ── migration (as postgres) ───────────────────────────────────────────────────
-- Valid claims even here: see staging-block-test.sql on pooled backends.
set local request.jwt.claims = '{"role":"service_role"}';
select not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'watching_progress' and column_name = 'last_activity_at'
) as need_apply \gset
\if :need_apply
\echo '=== applying 20261111100000 ==='
\i supabase/migrations/20261111100000_watching_progress_last_activity.sql
\else
\echo 'already applied on Staging: checking the live triggers'
\endif

-- ── fixture (as postgres) ─────────────────────────────────────────────────────
insert into public.watching_progress (user_id, tmdb_id, title, current_season, current_episode)
values (:A, :X, 'Activity test show', 1, 2), (:A, :Z, 'Activity test show 3', 1, 1);
-- A supplied updated_at is kept (20261110140000), so the pointer time is old
-- and any move below is last_activity_at's.
update public.watching_progress set updated_at = :OLD where user_id = :A and tmdb_id in (:X, :Z);

-- A visitor needs a public profile.
update public.profiles set is_public = true where id = :A;

\echo ''
\echo '=== as A, the owner ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;

select case when last_activity_at is null then 'PASS' else 'FAIL' end
  || '  a show with no outside activity has none'
from public.watching_progress where tmdb_id = :X;

-- 1. A History log, as useHistory writes it (one tv row), and its deletion.
insert into public.history (user_id, tmdb_id, media_type, title)
values (:A, :X, 'tv', 'Activity test show');
select case when last_activity_at = now() and updated_at = :OLD then 'PASS' else 'FAIL' end
  || '  a History log moves last_activity_at and leaves the pointer time alone'
from public.watching_progress where tmdb_id = :X;
delete from public.history where user_id = :A and tmdb_id = :X and media_type = 'tv';
select case when last_activity_at is null and updated_at = :OLD then 'PASS' else 'FAIL' end
  || '  deleting that History log moves it back'
from public.watching_progress where tmdb_id = :X;

-- 2. A title-page tick, as saveEpisodeWatches writes it (upsert), then an
--    un-tick, a re-tick (the upsert's update path) and a delete.
insert into public.episode_watch_overrides (user_id, tmdb_id, season_number, episode_number, watched)
values (:A, :X, 1, 1, true)
on conflict (user_id, tmdb_id, season_number, episode_number) do update set watched = excluded.watched;
select case when last_activity_at = now() and updated_at = :OLD then 'PASS' else 'FAIL' end
  || '  a title-page tick moves last_activity_at'
from public.watching_progress where tmdb_id = :X;
insert into public.episode_watch_overrides (user_id, tmdb_id, season_number, episode_number, watched)
values (:A, :X, 1, 1, false)
on conflict (user_id, tmdb_id, season_number, episode_number) do update set watched = excluded.watched;
select case when last_activity_at is null then 'PASS' else 'FAIL' end
  || '  un-ticking it moves the show back (an accidental tick does not pin it)'
from public.watching_progress where tmdb_id = :X;
insert into public.episode_watch_overrides (user_id, tmdb_id, season_number, episode_number, watched)
values (:A, :X, 1, 1, true)
on conflict (user_id, tmdb_id, season_number, episode_number) do update set watched = excluded.watched;
select case when last_activity_at = now() then 'PASS' else 'FAIL' end
  || '  re-ticking an existing episode (upsert update path) moves it again'
from public.watching_progress where tmdb_id = :X;
delete from public.episode_watch_overrides where user_id = :A and tmdb_id = :X;
select case when last_activity_at is null then 'PASS' else 'FAIL' end
  || '  deleting the tick moves it back'
from public.watching_progress where tmdb_id = :X;

-- 3. An import, through the real RPC (50 episodes in one call), then the
--    events deleted, then a 2,000-row bulk insert in one statement.
select public.import_watch_events((
  select jsonb_agg(jsonb_build_object(
    'event', jsonb_build_object(
      'source', 'staging-test', 'source_account', 'staging-test',
      'source_key', 'staging-last-activity-' || n,
      'tmdb_id', :X, 'media_type', 'tv',
      'season_number', 1, 'episode_number', n, 'date_precision', 'unknown'),
    'summary', jsonb_build_object('tmdb_id', :X, 'media_type', 'tv')))
  from generate_series(1, 50) n
)) as import_result;
select case when last_activity_at = now() and updated_at = :OLD then 'PASS' else 'FAIL' end
  || '  an import moves last_activity_at and leaves the pointer time alone'
from public.watching_progress where tmdb_id = :X;
delete from public.watch_events where user_id = :A and tmdb_id = :X;
select case when last_activity_at is null then 'PASS' else 'FAIL' end
  || '  deleting the imported events moves it back'
from public.watching_progress where tmdb_id = :X;
insert into public.watch_events (user_id, source, source_account, source_key, tmdb_id, media_type,
  season_number, episode_number, date_precision)
select :A, 'staging-test', 'staging-test', 'staging-last-activity-bulk-' || n, :X, 'tv', 2, n, 'unknown'
from generate_series(1, 2000) n;
select case when last_activity_at = now() then 'PASS' else 'FAIL' end
  || '  a 2,000-row bulk insert moves it'
from public.watching_progress where tmdb_id = :X;
select case when count(*) = 7 and bool_and((tgtype & 1) = 0) then 'PASS' else 'FAIL' end
  || '  all 7 activity triggers are statement-level (one recompute per show, not per row)'
from pg_trigger
where tgname in ('watch_events_activity_insert', 'watch_events_activity_delete',
  'episode_watch_overrides_activity_insert', 'episode_watch_overrides_activity_update',
  'episode_watch_overrides_activity_delete', 'history_activity_insert', 'history_activity_delete');

-- The pointer's own behaviour is unchanged.
update public.watching_progress set current_episode = 3 where tmdb_id = :X;
select case when updated_at = now() and last_activity_at = now() then 'PASS' else 'FAIL' end
  || '  a pointer tick still stamps updated_at'
from public.watching_progress where tmdb_id = :X;
update public.watching_progress set current_episode = 2, updated_at = :OLD where tmdb_id = :X;
select case when updated_at = :OLD then 'PASS' else 'FAIL' end
  || '  undo still keeps the previous updated_at (20261110140000)'
from public.watching_progress where tmdb_id = :X;

-- 4. A movie log is not activity on a show that shares the number.
insert into public.history (user_id, tmdb_id, media_type, title)
values (:A, :Z, 'movie', 'Activity test movie');
select case when last_activity_at is null then 'PASS' else 'FAIL' end
  || '  a movie log does not move a show'
from public.watching_progress where tmdb_id = :Z;

-- 5. A device clock cannot push a show to the front, by either door.
insert into public.watch_events (user_id, source, source_account, source_key, tmdb_id, media_type,
  season_number, episode_number, date_precision, created_at)
values (:A, 'staging-test', 'staging-test', 'staging-last-activity-clock', :Z, 'tv', 1, 1, 'unknown',
  now() + interval '1 day');
select case when last_activity_at = now() then 'PASS' else 'FAIL' end
  || '  a future created_at from the client is clamped to now()'
from public.watching_progress where tmdb_id = :Z;
update public.watching_progress set last_activity_at = now() + interval '1 day' where tmdb_id = :Z;
select case when last_activity_at = now() then 'PASS' else 'FAIL' end
  || '  a future last_activity_at written directly is clamped to now()'
from public.watching_progress where tmdb_id = :Z;

-- 6. Starting a show already logged in History picks that log up.
reset role;
insert into public.history (user_id, tmdb_id, media_type, title, created_at)
values (:A, :Y, 'tv', 'Activity test show 2', '2026-03-01T00:00:00Z');
set local role authenticated;
insert into public.watching_progress (user_id, tmdb_id, title, current_season, current_episode, last_activity_at)
values (:A, :Y, 'Activity test show 2', 1, 1, now() + interval '1 day');
select case when last_activity_at = '2026-03-01T00:00:00Z' then 'PASS' else 'FAIL' end
  || '  a new pointer row takes earlier activity from the server, not the client''s value'
from public.watching_progress where tmdb_id = :Y;
-- Older pointer time than X's activity, so the order below is not a tie.
update public.watching_progress set updated_at = :OLD where tmdb_id = :Y;

\echo ''
\echo '=== as B, a visitor to A''s public profile ==='
set local request.jwt.claims = :B_CLAIMS;
select case when count(*) = 2
  and (array_agg(tmdb_id order by greatest(updated_at, last_activity_at) desc))[1] = :X
  then 'PASS' else 'FAIL' end
  || '  a visitor reads last_activity_at and gets the owner''s order'
from public.watching_progress where user_id = :A and tmdb_id in (:X, :Y);
with hit as (
  update public.watching_progress set last_activity_at = :OLD where user_id = :A returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL' end
  || '  a visitor cannot write someone else''s last_activity_at'
from hit;
select case when not has_function_privilege('authenticated', 'public.watching_activity_for(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.watching_activity_for(uuid, integer)', 'execute')
  then 'PASS' else 'FAIL' end
  || '  the helper that reads owner-only tables is not callable over the API'
;

rollback;

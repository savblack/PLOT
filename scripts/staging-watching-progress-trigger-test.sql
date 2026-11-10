-- Prove that undoing an episode tick no longer moves the show to the front.
--
--   set -a; . .env; set +a
--   pnpm run staging:watching-progress-trigger-test
--
-- WHY: the client's undo (packages/core/useWatching.js restorePointer) writes
-- the previous updated_at back, and the old trigger overwrote it with now(),
-- so the show jumped to the front of Continue watching. The fix is
-- supabase/migrations/20261110120000_watching_progress_keep_supplied_updated_at.sql.
-- Unit tests can only check what the client sends; this runs the trigger.
--
-- The `REPRO` line runs against whatever body is LIVE on Staging first. A run
-- that reports `no repro` means the fix is already applied there.
--
-- Every write goes through RLS as fixture account A (auth.uid()), the way the
-- app writes. Everything, including the `create or replace`, is in one
-- transaction ending in rollback, so Staging is unchanged whether this passes
-- or dies. tmdb_id -1 is not a TMDB id on purpose (AGENTS.md: never guess one).
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
\set A_CLAIMS '''{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}'''
\set B_CLAIMS '''{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}'''

begin;

-- ── fixture (as postgres) ─────────────────────────────────────────────────────
-- Valid claims even here: see staging-block-test.sql on pooled backends.
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.watching_progress (user_id, tmdb_id, title, current_season, current_episode, updated_at)
values (:A, -1, 'Trigger test show', 1, 2, '2026-01-01T00:00:00Z');

\echo ''
\echo '=== BEFORE: the trigger as it is live ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;
update public.watching_progress set current_episode = 3 where tmdb_id = -1;
update public.watching_progress set current_episode = 2, updated_at = '2026-01-01T00:00:00Z' where tmdb_id = -1;
select case when updated_at = '2026-01-01T00:00:00Z'
  then 'no repro  undo kept the old updated_at against the OLD body'
  else 'REPRO     undo stamped now(), so the show jumps to the front' end
from public.watching_progress where tmdb_id = -1;

\echo ''
\echo '=== applying the new body ==='
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
\i supabase/migrations/20261110120000_watching_progress_keep_supplied_updated_at.sql
update public.watching_progress set current_episode = 2, updated_at = '2026-01-01T00:00:00Z' where user_id = :A and tmdb_id = -1;

\echo ''
\echo '=== AFTER (as A) ==='
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;

-- A tick, as markEpisodeWatched writes it (no updated_at: the server stamps it).
update public.watching_progress set current_episode = 3 where tmdb_id = -1;
select case when updated_at = now() then 'PASS' else 'FAIL' end || '  a tick is stamped with the server''s now()'
from public.watching_progress where tmdb_id = -1;

-- Undo, as restorePointer writes it.
update public.watching_progress set current_episode = 2, updated_at = '2026-01-01T00:00:00Z' where tmdb_id = -1;
select case when updated_at = '2026-01-01T00:00:00Z' and current_episode = 2 then 'PASS' else 'FAIL' end
  || '  undo keeps the previous updated_at (no jump to the front)'
from public.watching_progress where tmdb_id = -1;


-- A fast device clock cannot push a show into the future.
update public.watching_progress set updated_at = now() + interval '1 day' where tmdb_id = -1;
select case when updated_at = now() then 'PASS' else 'FAIL' end || '  a future updated_at is clamped to now()'
from public.watching_progress where tmdb_id = -1;

-- startWatching's upsert on an existing row (ON CONFLICT DO UPDATE), which
-- sends no updated_at. Reset to an old time first so the stamp is visible.
update public.watching_progress set updated_at = '2026-01-01T00:00:00Z' where tmdb_id = -1;
insert into public.watching_progress (user_id, tmdb_id, title, current_season, current_episode)
values (:A, -1, 'Trigger test show', 1, 1)
on conflict (user_id, tmdb_id) do update
  set current_season = excluded.current_season, current_episode = excluded.current_episode;
select case when updated_at = now() and current_episode = 1 then 'PASS' else 'FAIL' end
  || '  restarting a show is stamped with the server''s now()'
from public.watching_progress where tmdb_id = -1;

\echo ''
\echo '=== AFTER (as B, a different user) ==='
set local request.jwt.claims = :B_CLAIMS;
with hit as (
  update public.watching_progress set updated_at = '2020-01-01T00:00:00Z' where user_id = :A and tmdb_id = -1 returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || '  another user cannot set someone else''s updated_at'
from hit;

\echo ''
\echo '=== episode ticks (episode_watch_overrides) ==='
-- 2147483647 (the int maximum) because this table requires tmdb_id > 0; it is
-- not a TMDB id and the row is rolled back with everything else.
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
\i supabase/migrations/20261110130000_episode_watch_overrides_server_updated_at.sql
set local role authenticated;
set local request.jwt.claims = :A_CLAIMS;

-- A device clock a day fast, as an old app version would send it.
insert into public.episode_watch_overrides (user_id, tmdb_id, season_number, episode_number, watched, updated_at)
values (:A, 2147483647, 1, 1, true, now() + interval '1 day');
select case when updated_at = now() then 'PASS' else 'FAIL' end || '  a new tick is stamped with the server''s now(), not the device clock'
from public.episode_watch_overrides where tmdb_id = 2147483647;

-- Re-ticking an existing row (the upsert's update path), slow clock this time.
insert into public.episode_watch_overrides (user_id, tmdb_id, season_number, episode_number, watched, updated_at)
values (:A, 2147483647, 1, 1, false, '2020-01-01T00:00:00Z')
on conflict (user_id, tmdb_id, season_number, episode_number) do update
  set watched = excluded.watched, updated_at = excluded.updated_at;
select case when updated_at = now() and not watched then 'PASS' else 'FAIL' end || '  an updated tick is stamped with the server''s now()'
from public.episode_watch_overrides where tmdb_id = 2147483647;

-- A client cannot call the trigger function directly.
do $$
begin
  perform public.set_episode_watch_override_updated_at();
  raise notice 'FAIL  a client could call the trigger function';
exception when others then
  raise notice 'PASS  a client cannot call the trigger function (%)', sqlerrm;
end $$;

rollback;
\echo 'rolled back: Staging is unchanged'

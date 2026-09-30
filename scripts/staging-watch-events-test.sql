\set ON_ERROR_STOP on
begin;
\i supabase/migrations/20260916140001_watch_event_foundation.sql
\i supabase/migrations/20260916150000_import_watch_events.sql
\i supabase/migrations/20260916170000_episode_watch_overrides.sql
-- Existing staging identities and real catalogue IDs; no invented TMDB IDs.
create temporary table event_test_fixture as
select h.* from public.history h limit 1;
do $$ begin
  if not exists (select 1 from event_test_fixture) then
    raise exception 'Staging needs an existing watched title for this proof';
  end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true)
from event_test_fixture \gset
-- psql output intentionally suppressed by gset; no account details in logs.
grant select on event_test_fixture to authenticated;
set local role authenticated;
insert into public.watch_events(user_id, source, source_account, source_key, tmdb_id, media_type, date_precision)
select user_id, 'test', 'test', 'test-owner-event', tmdb_id, media_type, 'unknown' from event_test_fixture;
do $$ begin
  if (select count(*) from public.watch_events) <> 1 then raise exception 'Owner cannot read event'; end if;
  raise notice 'PASS owner can insert and read own unknown-date event';
end $$;
reset role;
-- Distinct UUID used solely as an unaffiliated JWT subject, not a media ID.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true) \gset
set local role authenticated;
do $$ begin
  if exists (select 1 from public.watch_events) then raise exception 'Cross-account read leak'; end if;
  delete from public.watch_events;
  begin
    insert into public.watch_events(user_id, source, source_account, source_key, tmdb_id, media_type, date_precision)
    select user_id, 'test', 'test', 'forged-event', tmdb_id, media_type, 'unknown' from event_test_fixture;
    raise exception 'Cross-account insert succeeded';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS cross-account read, write and delete isolation';
end $$;
reset role;
do $$ begin
  if (select count(*) from public.watch_events) <> 1 then raise exception 'Cross-account delete succeeded'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.watch_events;
    raise exception 'Anonymous read succeeded';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS anonymous access denied';
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true)
from event_test_fixture \gset
set local role authenticated;
do $$
declare payload jsonb; result jsonb;
begin
  select jsonb_build_array(jsonb_build_object(
    'event', jsonb_build_object('source', 'test', 'source_account', 'saved-export',
      'source_key', 'atomic-watch', 'tmdb_id', tmdb_id, 'media_type', media_type,
      'date_precision', 'unknown', 'external_ids', '{}'::jsonb),
    'summary', to_jsonb(f) || jsonb_build_object('note', 'must not replace PLOT note', 'rating', 1)))
    into payload from event_test_fixture f;
  result := public.import_watch_events(payload);
  if result->>'inserted' <> '1' then raise exception 'Event not inserted'; end if;
  result := public.import_watch_events(payload);
  if result->>'duplicates' <> '1' then raise exception 'Retry duplicated event'; end if;
  if exists (select 1 from public.history h join event_test_fixture f using (id)
    where h.note is distinct from f.note or h.rating is distinct from f.rating) then
    raise exception 'Import replaced PLOT edit';
  end if;
  raise notice 'PASS atomic import, repeat-file idempotency and PLOT edit preservation';
  payload := jsonb_set(payload, '{0,event,source_key}', '"rollback-watch"');
  begin
    perform public.import_watch_events(payload || '[{"event":{},"summary":{}}]'::jsonb);
    raise exception 'Invalid batch unexpectedly succeeded';
  exception when not_null_violation then null;
  end;
  if exists (select 1 from public.watch_events where source_key = 'rollback-watch') then
    raise exception 'Failed batch left a partial event';
  end if;
  raise notice 'PASS failed batch rolls back every event';
end $$;
reset role;

-- A real existing TV catalogue ID, with no invented episode catalogue ID.
create temporary table episode_test_fixture as
select h.* from public.history h where h.media_type = 'tv' limit 1;
do $$ begin
  if not exists (select 1 from episode_test_fixture) then
    raise exception 'Staging needs an existing TV history item for this proof';
  end if;
end $$;
grant select on episode_test_fixture to authenticated;
-- Detect even an attempted history insert (including ON CONFLICT DO NOTHING).
-- This trigger and function exist only inside this rolled-back test transaction.
create function public.test_reject_episode_summary() returns trigger language plpgsql as $$
begin raise exception 'Episode import attempted a whole-series history write'; end;
$$;
create trigger test_reject_episode_summary before insert on public.history
for each row execute function public.test_reject_episode_summary();
select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true)
from episode_test_fixture \gset
set local role authenticated;
do $$
declare payload jsonb; result jsonb; progress_before jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(w) order by w.tmdb_id), '[]'::jsonb)
    into progress_before from public.watching_progress w where user_id = auth.uid();
  select jsonb_build_array(jsonb_build_object(
    'event', jsonb_build_object('source', 'test', 'source_account', 'saved-export',
      'source_key', 'sparse-episode', 'tmdb_id', tmdb_id, 'media_type', 'tv',
      'season_number', 1, 'episode_number', 3, 'date_precision', 'unknown'),
    'summary', to_jsonb(f))) into payload from episode_test_fixture f;
  result := public.import_watch_events(payload);
  if result->>'inserted' <> '1' then raise exception 'Episode was not saved'; end if;
  if (select count(*) from public.watch_events where source_key = 'sparse-episode'
      and season_number = 1 and episode_number = 3 and watched_on is null) <> 1 then
    raise exception 'Episode identity or unknown date was lost';
  end if;
  if progress_before is distinct from (select coalesce(jsonb_agg(to_jsonb(w) order by w.tmdb_id), '[]'::jsonb)
      from public.watching_progress w where user_id = auth.uid()) then
    raise exception 'Sparse episode changed the continuous progress pointer';
  end if;
  result := public.import_watch_events(payload);
  if result->>'duplicates' <> '1' then raise exception 'Episode retry duplicated a watch'; end if;
  raise notice 'PASS sparse episode preserves gaps, avoids series completion and retries safely';
  insert into public.episode_watch_overrides(user_id, tmdb_id, season_number, episode_number, watched)
    select user_id, tmdb_id, 1, 3, false from episode_test_fixture;
  perform public.import_watch_events(payload);
  if not exists (select 1 from public.episode_watch_overrides where not watched) then
    raise exception 'Reimport lost the manual undo';
  end if;
  if not exists (select 1 from public.watch_events where source_key = 'sparse-episode') then
    raise exception 'Undo deleted source history';
  end if;
  update public.episode_watch_overrides set watched = true where user_id = auth.uid();
  if not exists (select 1 from public.episode_watch_overrides where watched) then
    raise exception 'Owner cannot redo episode';
  end if;
  raise notice 'PASS manual episode undo survives reimport without deleting source watches';
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true) \gset
set local role authenticated;
do $$ begin
  if exists (select 1 from public.episode_watch_overrides) then raise exception 'Cross-account episode read'; end if;
  update public.episode_watch_overrides set watched = false;
  delete from public.episode_watch_overrides;
  begin
    insert into public.episode_watch_overrides(user_id, tmdb_id, season_number, episode_number, watched)
      select user_id, tmdb_id, 1, 4, false from episode_test_fixture;
    raise exception 'Cross-account episode insert';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.episode_watch_overrides where watched) <> 1 then
    raise exception 'Cross-account episode mutation succeeded';
  end if;
  raise notice 'PASS episode override cross-account read, insert, update and delete isolation';
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.episode_watch_overrides;
    raise exception 'Anonymous episode read';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS episode overrides deny anonymous access';
end $$;
reset role;
rollback;

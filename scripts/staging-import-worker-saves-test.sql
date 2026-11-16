-- Prove the import-worker can save an import, and that nobody else can use
-- the functions that let it.
--
--   pnpm run staging:test -- import-worker-saves
--
-- WHY: the worker is the service role. import_watch_events, import_saved_list
-- and import_saved_annotations read the account from auth.uid(), so they
-- refused every batch from it and a background import saved nothing. Found on
-- production on 2026-11-16 (four files, imported = 0 for each). The first
-- block below reproduces that refusal; the rest proves the fix in
-- supabase/migrations/20261116213000_import_worker_saves_as_user.sql.
--
-- One transaction ending in rollback: Staging is unchanged either way.
\set ON_ERROR_STOP on
begin;

-- A title Staging already knows, so no TMDB id is typed in here.
create temporary table worker_title as
  select tmdb_id, media_type, title from public.history where media_type = 'movie' limit 1;
do $$ begin if not exists (select 1 from worker_title) then raise exception 'An existing Staging movie is required'; end if; end $$;
grant select on worker_title to service_role, authenticated, anon;

-- ── the worker: service role, no account ─────────────────────────────────────
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
do $$
declare
  a constant uuid := '467ce784-39eb-480e-8593-4632667fc9c3'; -- fixture account A
  t record; result jsonb; refused integer := 0;
begin
  select * into t from worker_title;

  -- The failure, before the fix: the plain writers refuse the worker.
  begin perform public.import_watch_events('[]'); exception when insufficient_privilege then refused := refused + 1; end;
  begin perform public.import_saved_list('{"kind":"watchlist","key":"k","name":"Watchlist"}', '[]'); exception when insufficient_privilege then refused := refused + 1; end;
  begin perform public.import_saved_annotations('[]'); exception when insufficient_privilege then refused := refused + 1; end;
  if refused <> 3 then raise exception 'Expected the three plain writers to refuse the service role, got %', refused; end if;
  raise notice 'PASS the plain import writers refuse the worker (the bug)';

  -- A watch.
  result := public.import_watch_events_as(a, jsonb_build_array(jsonb_build_object(
    'event', jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', t.media_type, 'source', 'letterboxd', 'source_account', 'local',
      'source_key', 'worker-proof-watch', 'date_precision', 'unknown'),
    'summary', jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', t.media_type, 'title', t.title))));
  if result->>'inserted' <> '1' or not exists (select 1 from public.watch_events where user_id = a and source_key = 'worker-proof-watch') then
    raise exception 'Watch was not saved for the account: %', result;
  end if;
  if not exists (select 1 from public.history where user_id = a and tmdb_id = t.tmdb_id and media_type = t.media_type) then
    raise exception 'History summary was not saved for the account';
  end if;
  raise notice 'PASS the worker saves a watch, and its history summary, for the account';

  -- The request is the service role again afterwards, with no account.
  if auth.uid() is not null or (current_setting('request.jwt.claims', true)::jsonb->>'role') <> 'service_role' then
    raise exception 'The account stayed named after the call';
  end if;
  raise notice 'PASS the request is the service role again after the call';

  -- A second run of the same file adds nothing.
  result := public.import_watch_events_as(a, jsonb_build_array(jsonb_build_object(
    'event', jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', t.media_type, 'source', 'letterboxd', 'source_account', 'local',
      'source_key', 'worker-proof-watch', 'date_precision', 'unknown'),
    'summary', jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', t.media_type, 'title', t.title))));
  if result->>'duplicates' <> '1' then raise exception 'Reimport was not a duplicate: %', result; end if;
  raise notice 'PASS importing the same watch again adds nothing';

  -- A watchlist entry.
  result := public.import_saved_list_as(a, '{"kind":"watchlist","key":"worker-proof:watchlist","name":"Watchlist"}',
    jsonb_build_array(jsonb_build_object('source_key', 'worker-proof-list',
      'summary', jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', t.media_type, 'title', t.title, 'poster_path', null))));
  if coalesce((result->>'inserted')::integer, 0) + coalesce((result->>'duplicates')::integer, 0) <> 1 or result ? 'not_imported' then
    raise exception 'Watchlist entry was not saved: %', result;
  end if;
  raise notice 'PASS the worker saves a watchlist entry for the account';

  -- A rating.
  result := public.import_saved_annotations_as(a, jsonb_build_array(jsonb_build_object(
    'source', 'letterboxd', 'source_key', 'worker-proof-rating', 'tmdb_id', t.tmdb_id, 'media_type', t.media_type,
    'annotation_scope', 'movie', 'annotation', jsonb_build_object('kind', 'rating', 'rating', 8, 'ratedAt', null))));
  if result->>'inserted' <> '1' or not exists (select 1 from public.imported_annotations where user_id = a and source_key = 'worker-proof-rating') then
    raise exception 'Rating was not saved for the account: %', result;
  end if;
  raise notice 'PASS the worker saves a rating for the account';

  -- No account, or one that does not exist, is refused.
  begin perform public.import_watch_events_as(null, '[]'); raise exception 'A null account was accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.import_watch_events_as(gen_random_uuid(), '[]'); raise exception 'An unknown account was accepted';
  exception when invalid_parameter_value then null; end;
  raise notice 'PASS a missing or unknown account is refused';

  -- The two helpers are not for calling on their own, even by the service role.
  begin perform public.import_act_as_user(a); raise exception 'The service role named an account directly';
  exception when insufficient_privilege then null; end;
  begin perform public.import_act_as_restore('{}'); raise exception 'The service role called the restore helper directly';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS the helpers cannot be called on their own';
end $$;
reset role;

-- ── a signed-in person: cannot save into someone else's account ───────────────
select set_config('request.jwt.claims', '{"sub":"e4e955fb-19f0-4e7d-b234-29c8eafa88fb","role":"authenticated"}', true) \gset
set local role authenticated;
do $$
declare a constant uuid := '467ce784-39eb-480e-8593-4632667fc9c3'; denied integer := 0;
begin
  begin perform public.import_watch_events_as(a, '[]'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_saved_list_as(a, '{}', '[]'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_saved_annotations_as(a, '[]'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_act_as_user(a); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_act_as_restore('{}'); exception when insufficient_privilege then denied := denied + 1; end;
  if denied <> 5 then raise exception 'A signed-in person could call % of the 5 worker functions', 5 - denied; end if;
  raise notice 'PASS a signed-in person cannot call any of the worker functions';
end $$;
reset role;

-- ── nobody signed in ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true) \gset
set local role anon;
do $$
declare a constant uuid := '467ce784-39eb-480e-8593-4632667fc9c3'; denied integer := 0;
begin
  begin perform public.import_watch_events_as(a, '[]'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_saved_list_as(a, '{}', '[]'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_saved_annotations_as(a, '[]'); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_act_as_user(a); exception when insufficient_privilege then denied := denied + 1; end;
  begin perform public.import_act_as_restore('{}'); exception when insufficient_privilege then denied := denied + 1; end;
  if denied <> 5 then raise exception 'An anonymous caller could call % of the 5 worker functions', 5 - denied; end if;
  raise notice 'PASS an anonymous caller cannot call any of the worker functions';
end $$;
reset role;

rollback;

-- Prove the site-wide import cap and the duplicate-upload refusal on Staging.
--
--   set -a; . .env; set +a
--   pnpm run staging:import-cap-test
--
-- WHY: claim_import_job allowed one running import per account but no limit
-- across accounts, so every user importing at once meant that many workers
-- writing at once. enqueue_file_import_job accepted the same file twice
-- (2026-11-10: one account queued the same IMDb and Letterboxd files twice
-- each). The fix is supabase/migrations/20261111090000_import_jobs_global_cap.sql.
--
-- The `REPRO` line runs against whatever claim_import_job is LIVE on Staging
-- first. A run that reports `no repro` means the fix is already applied there.
--
-- Claims run as service_role (the worker's role); enqueues as a real account
-- through auth.uid(). Simultaneous claims from separate connections cannot
-- happen inside one transaction; that race was proven on a restored copy of
-- production (12 at once, 3 claimed). Everything, including the migration, is
-- in one transaction ending in rollback, so Staging is unchanged whether this
-- passes or dies.
\set ON_ERROR_STOP on

begin;

-- ── fixture (as postgres) ─────────────────────────────────────────────────────
set local request.jwt.claims = '{"role":"service_role"}';
-- Start from an empty queue so only this script's jobs count toward the cap.
update public.import_jobs set status = 'cancelled', lease_token = null, lease_until = null
  where status in ('queued','running','retry_wait');
create temporary table cap_users as
  select id, row_number() over (order by created_at) n from auth.users order by created_at limit 4;
do $$ begin
  if (select count(*) from cap_users) < 4 then raise exception 'Four Staging accounts are required'; end if;
end $$;
insert into public.import_jobs(user_id, kind, source, files) select id, 'file', 'imdb', '{}' from cap_users;
grant select on cap_users to service_role, authenticated;

-- ── REPRO: the live body runs one job per account, with no total ─────────────
set local role service_role;
do $$ declare n integer := 0; begin
  for i in 1..4 loop
    if public.claim_import_job() is not null then n := n + 1; end if;
  end loop;
  if n = 4 then raise notice 'REPRO live claim_import_job ran all 4 accounts at once';
  else raise notice 'no repro: live claim_import_job ran % of 4 (fix already applied?)', n; end if;
end $$;
reset role;
update public.import_jobs set status = 'queued', lease_token = null, lease_until = null
  where user_id in (select id from cap_users) and status = 'running';

\i supabase/migrations/20261111090000_import_jobs_global_cap.sql

-- ── the cap ───────────────────────────────────────────────────────────────────
set local role service_role;
do $$ declare n integer := 0; late uuid; begin
  for i in 1..4 loop
    if public.claim_import_job() is not null then n := n + 1; end if;
  end loop;
  if n <> 3 then raise exception 'FAIL expected 3 claims under the cap, got %', n; end if;
  raise notice 'PASS 4 accounts waiting, 3 run and 1 stays queued';

  select id into late from cap_users where id not in (select user_id from public.import_jobs where status = 'running');
  if public.claim_import_job(late) is not null then raise exception 'FAIL an app nudge got past a full cap'; end if;
  raise notice 'PASS an app nudge for the waiting account is refused while the cap is full';

  -- A worker that died: its lease runs out and the slot is free again.
  update public.import_jobs set lease_until = now() - interval '1 second'
    where id = (select id from public.import_jobs where status = 'running' and user_id in (select id from cap_users) limit 1);
  if public.claim_import_job() is null then raise exception 'FAIL an expired lease still held its slot'; end if;
  raise notice 'PASS an expired lease frees its slot';

  -- Fairness: account 1 closed the app and has waited longest; account 2's
  -- app nudges. The free slot goes to account 1, not back to account 2.
  update public.import_jobs set status = 'queued', lease_token = null, lease_until = null
    where user_id in (select id from cap_users) and status = 'running';
  update public.import_jobs set available_at = now() - interval '10 minutes' where user_id = (select c.id from cap_users c where c.n = 1);
  update public.import_jobs set available_at = now() - interval '1 minute' where user_id = (select c.id from cap_users c where c.n = 2);
  if (public.claim_import_job((select c.id from cap_users c where c.n = 2)) ->> 'user_id')::uuid <> (select c.id from cap_users c where c.n = 1) then
    raise exception 'FAIL a nudge jumped ahead of an account that waited longer';
  end if;
  if (public.claim_import_job((select c.id from cap_users c where c.n = 2)) ->> 'user_id')::uuid <> (select c.id from cap_users c where c.n = 2) then
    raise exception 'FAIL a nudge did not take its own job once it was the oldest';
  end if;
  raise notice 'PASS a nudge takes the longest-waiting job first, then its own';
end $$;
reset role;

-- ── duplicate uploads ────────────────────────────────────────────────────────
create temporary table dup as
  select (select c.id from cap_users c where c.n = 1) uid, gen_random_uuid() j1, gen_random_uuid() j2,
         gen_random_uuid() j3, gen_random_uuid() j4, repeat('a', 64) h, repeat('b', 64) h2;
grant select on dup to authenticated;
-- Clear the cap fixture's job for this account so only the queue-full check differs.
update public.import_jobs set status = 'cancelled' where user_id = (select uid from dup);
insert into storage.objects(bucket_id, name, owner_id)
  select 'import-uploads', d.uid || '/' || x || '/ratings.csv', d.uid::text from dup d, unnest(array[d.j1, d.j2, d.j3, d.j4]) x;
select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) from dup \gset
set local role authenticated;
do $$ declare d dup; begin
  select * into d from dup;
  perform public.enqueue_file_import_job(d.j1, 'imdb', array[d.uid || '/' || d.j1 || '/ratings.csv'], 'import_page', d.h);
  begin
    perform public.enqueue_file_import_job(d.j2, 'imdb', array[d.uid || '/' || d.j2 || '/ratings.csv'], 'import_page', d.h);
    raise exception 'FAIL the same file was queued twice';
  exception when unique_violation then
    if sqlerrm <> 'import_duplicate' then raise; end if;
  end;
  raise notice 'PASS the same file for the same source is refused while it is open';

  perform public.enqueue_file_import_job(d.j2, 'imdb', array[d.uid || '/' || d.j2 || '/ratings.csv'], 'import_page', d.h2);
  raise notice 'PASS a different file is queued';

  perform public.enqueue_file_import_job(d.j3, 'imdb', array[d.uid || '/' || d.j3 || '/ratings.csv']);
  raise notice 'PASS a 4-argument call (older app builds) still queues';
end $$;
reset role;
update public.import_jobs set status = 'failed' where id = (select j1 from dup);
set local role authenticated;
do $$ declare d dup; begin
  select * into d from dup;
  perform public.enqueue_file_import_job(d.j4, 'imdb', array[d.uid || '/' || d.j4 || '/ratings.csv'], 'import_page', d.h);
  raise notice 'PASS the same file can be tried again once the first job has finished';
  begin
    perform public.claim_import_job();
    raise exception 'FAIL an app account can claim worker jobs';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS claim_import_job stays worker-only';
end $$;
reset role;

rollback;
\echo rolled back

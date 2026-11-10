-- Imports: a site-wide limit on how many run at once, and no second copy of
-- a file that is already importing.
--
-- 1. claim_import_job: at most MAX_RUNNING jobs (all users together) hold a
--    live lease at a time. claim_import_job already allowed one running job
--    per account, but nothing bounded the total: every open app with a job
--    waiting nudges the worker every 4 seconds (core/importJobs.js POLL_MS),
--    so N users importing at once meant N workers writing at once. With the
--    cap, the rest stay queued and the next nudge or 5-minute tick takes them.
--    A finished slice requeues its job with available_at = now(), behind
--    jobs that have waited longer. An app's nudge takes the longest-waiting
--    job when that belongs to someone else (review, 2026-11-11: otherwise
--    three open apps re-take their slot every 4 seconds and a user who closed
--    the app waits for one of those imports to finish entirely).
--
--    Claims take one transaction-level advisory lock so the count and the
--    claim are atomic: without it, two concurrent claims could both see 2 of
--    3 slots taken and both claim. A claim is a few index reads, so the lock
--    is held for microseconds.
--
--    Measured on a restored copy of production (2026-11-11): writing a
--    2,348-title import is 47 batches of 50, about 70 ms of database time and
--    2 MB of WAL including its one feed post per title. So the cap is a bound
--    on the worst case, not a fix for a measured overload.
--
-- 2. enqueue_file_import_job: takes the upload's SHA-256 (computed by the app,
--    core/importJobs.js importFileFingerprint) and refuses a second job for
--    the same source and the same file while the first is queued or running.
--    On 2026-11-10 one account uploaded the same IMDb and Letterboxd files
--    twice each. A partial unique index backs the check so two clicks racing
--    each other cannot both get in. Older app builds send no fingerprint and
--    are treated exactly as before.
--
--    The function gains a parameter, so it is dropped and recreated: a second
--    overload beside the old one would make PostgREST's 4-argument call
--    ambiguous. The new parameter has a default, so 4-argument callers
--    resolve to the new function.
--
-- Both bodies are the live production bodies (pg_get_functiondef on a
-- restore of 2026-11-11) with lines added only.
--
-- redefines: claim_import_job (adds a global running cap and oldest-first for nudges; loop body identical to live 2026-11-11)
-- redefines: enqueue_file_import_job (adds p_content_hash and the duplicate check; body otherwise identical to live 2026-11-11)

alter table public.import_jobs
  add column if not exists content_hash text
  check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists import_jobs_open_content
  on public.import_jobs(user_id, source, content_hash)
  where content_hash is not null and status in ('queued','running','retry_wait');

create or replace function public.claim_import_job(p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  job public.import_jobs;
  -- Imports running at once across every account. Raise with care: each
  -- running job is an edge function writing through PostgREST.
  max_running constant integer := 3;
begin
  perform pg_advisory_xact_lock(hashtextextended('plot.claim_import_job', 19));
  if (select count(*) from public.import_jobs
      where status = 'running' and lease_until >= now()) >= max_running then
    return null;
  end if;
  -- An app's nudge (p_user) must not keep re-taking a slot ahead of someone
  -- who closed the app and relies on the 5-minute tick: if another account's
  -- job has waited longer than this account's, take the oldest instead. The
  -- worker runs any job the same way; it reports only on the caller's own.
  if p_user is not null and exists (select 1 from public.import_jobs o
      where o.user_id <> p_user
      and ((o.status in ('queued','retry_wait') and o.available_at <= now()) or (o.status = 'running' and o.lease_until < now()))
      and o.available_at < coalesce((select min(m.available_at) from public.import_jobs m
        where m.user_id = p_user
        and ((m.status in ('queued','retry_wait') and m.available_at <= now()) or (m.status = 'running' and m.lease_until < now()))),
        'infinity'::timestamptz)) then
    p_user := null;
  end if;
  for job in select j.* from public.import_jobs j
    where (p_user is null or j.user_id = p_user)
    and ((j.status in ('queued','retry_wait') and j.available_at <= now()) or (j.status = 'running' and j.lease_until < now()))
    and not exists (select 1 from public.import_jobs r
      where r.user_id = j.user_id and r.id <> j.id and r.status = 'running' and r.lease_until >= now())
    order by j.available_at, j.created_at for update of j skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(job.user_id::text, 19)) then continue; end if;
    update public.import_jobs set status = 'running', lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes',
      attempts = case when job.status = 'running' then attempts + 1 else attempts end, updated_at = now()
      where id = job.id returning * into job;
    return to_jsonb(job);
  end loop;
  return null;
end $$;
revoke all on function public.claim_import_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_import_job(uuid) to service_role;

drop function if exists public.enqueue_file_import_job(uuid, text, text[], text);

create function public.enqueue_file_import_job(p_job uuid, p_source text, p_files text[], p_entry text default 'import_page', p_content_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs; path text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_job is null then raise exception 'Missing job id'; end if;
  if p_source in ('trakt','plex','simkl') then raise exception 'This source is a connection, not a file'; end if;
  if p_files is null or cardinality(p_files) = 0 then raise exception 'Choose a file to import'; end if;
  if cardinality(p_files) > 100 then raise exception 'Too many files'; end if;
  if p_entry not in ('onboarding','finishing_touches','import_page','settings') then p_entry := 'import_page'; end if;
  if p_content_hash is not null and p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid file fingerprint'; end if;
  -- The same file for the same source is already on its way in.
  if p_content_hash is not null and exists (select 1 from public.import_jobs
      where user_id = uid and source = p_source and content_hash = p_content_hash
      and status in ('queued','running','retry_wait')) then
    raise exception 'import_duplicate' using errcode = '23505';
  end if;
  if (select count(*) from public.import_jobs where user_id = uid and status in ('queued','running','retry_wait')) >= 10 then
    raise exception 'import_queue_full' using errcode = '23505';
  end if;
  foreach path in array p_files loop
    if path !~ ('^' || uid::text || '/' || p_job::text || '/[^/]+$') or path ~ '/_[^/]*$' then
      raise exception 'Invalid upload path';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'import-uploads' and name = path and owner_id = uid::text) then
      raise exception 'Upload not found';
    end if;
  end loop;
  begin
    insert into public.import_jobs(id, user_id, kind, source, entry, files, content_hash)
      values (p_job, uid, 'file', p_source, p_entry, p_files, p_content_hash)
      returning * into job;
  exception when unique_violation then
    -- Lost a race with an identical enqueue (import_jobs_open_content).
    if p_content_hash is not null and exists (select 1 from public.import_jobs
        where user_id = uid and source = p_source and content_hash = p_content_hash
        and status in ('queued','running','retry_wait')) then
      raise exception 'import_duplicate' using errcode = '23505';
    end if;
    raise;
  end;
  return to_jsonb(job);
end $$;
revoke all on function public.enqueue_file_import_job(uuid, text, text[], text, text) from public, anon;
grant execute on function public.enqueue_file_import_job(uuid, text, text[], text, text) to authenticated;

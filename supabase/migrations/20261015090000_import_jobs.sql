-- Background watch-history imports.
--
-- WHY: the file import (Letterboxd, Netflix, a Trakt export, ...) ran entirely
-- in the open page: parse, TMDB matching and the batched write all stopped the
-- moment the tab closed, and onboarding could only *remember* the source and
-- open the import page afterwards. The user asked for every import to start
-- inside onboarding and carry on while they finish setup or explore the app.
--
-- Shape: the app uploads the export to the private `import-uploads` bucket and
-- enqueues an `import_jobs` row. The `import-worker` edge function (driven by
-- pg_cron every minute, and kicked straight away by the app) claims the job
-- under a lease, works through it in slices that fit an edge function's wall
-- clock, checkpointing progress into the row, and finishes it. Home polls the
-- row to show "Matching 412 of 1,200" and the final counts.
--
-- Connection sources (Trakt, Plex, Simkl) use the same row with kind
-- 'connection': the worker runs the existing one-off account import server
-- side so the OAuth connect made during onboarding does not need the page.
--
-- Everything is additive. The worker reuses core's planner and writers, so an
-- import still never overwrites a rating, review or note the user already has
-- (see packages/core/importPlan.js).

-- ── Uploads bucket ──────────────────────────────────────────────────────────
-- Private. Paths are <user id>/<job id>/<file name>; the job's own artifacts
-- (_entries.json, _resolved.json, _review.json) sit beside the upload and are
-- written by the service role. 50 MB matches core's MAX_EXPANDED selection cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('import-uploads', 'import-uploads', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own import files" on storage.objects;
create policy "Users can upload their own import files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'import-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    -- The job's artifacts are the worker's to write.
    and (storage.filename(name)) !~ '^_'
  );

drop policy if exists "Users can read their own import files" on storage.objects;
create policy "Users can read their own import files"
  on storage.objects for select to authenticated
  using (bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own import files" on storage.objects;
create policy "Users can delete their own import files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Jobs ────────────────────────────────────────────────────────────────────
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('file', 'connection')),
  source text not null check (source in ('letterboxd','netflix','prime','disney','max','apple','imdb','trakt-export','tvtime','trakt','plex','simkl')),
  -- Where the import began (onboarding, the import page, Finishing touches).
  entry text not null default 'import_page',
  -- Storage object paths under <user id>/<job id>/ for a file job.
  files text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','retry_wait','succeeded','partial','failed','cancelled')),
  -- parse: read the upload; resolve: match titles against TMDB in slices;
  -- write: plan and write; done.
  phase text not null default 'parse' check (phase in ('parse','resolve','write','done')),
  checkpoint jsonb not null default '{}' check (jsonb_typeof(checkpoint) = 'object'),
  progress_done integer not null default 0 check (progress_done >= 0),
  progress_total integer not null default 0 check (progress_total >= 0),
  imported integer not null default 0 check (imported >= 0),
  duplicates integer not null default 0 check (duplicates >= 0),
  failed integer not null default 0 check (failed >= 0),
  -- Entries left out: no confident TMDB match, or a possible duplicate the
  -- user has to decide on. They wait in _review.json for the import page.
  review_count integer not null default 0 check (review_count >= 0),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  last_error text,
  -- The user dismissed the finished card on Home.
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index import_jobs_user_created on public.import_jobs(user_id, created_at desc);
create index import_jobs_due on public.import_jobs(status, available_at);
-- One import at a time per account: the planner reads existing history before
-- it writes, and two concurrent imports would race that read.
create unique index import_jobs_one_open on public.import_jobs(user_id)
  where status in ('queued','running','retry_wait');

alter table public.import_jobs enable row level security;
create policy import_jobs_owner_read on public.import_jobs for select to authenticated using (user_id = auth.uid());
revoke all on public.import_jobs from public, anon, authenticated;
grant select on public.import_jobs to authenticated;
grant all on public.import_jobs to service_role;

-- ── User controls ───────────────────────────────────────────────────────────
create function public.enqueue_connection_import_job(p_source text, p_entry text default 'import_page')
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_source not in ('trakt','plex','simkl') then raise exception 'Unsupported connection source'; end if;
  if p_entry not in ('onboarding','finishing_touches','import_page') then p_entry := 'import_page'; end if;
  if exists (select 1 from public.import_jobs where user_id = uid and status in ('queued','running','retry_wait')) then
    raise exception 'import_in_progress' using errcode = '23505';
  end if;
  if not exists (select 1 from public.media_integrations where user_id = uid and provider = p_source and status = 'active') then
    raise exception 'Connect % first', p_source using errcode = '42501';
  end if;
  insert into public.import_jobs(user_id, kind, source, entry)
    values (uid, 'connection', p_source, p_entry)
    returning * into job;
  return to_jsonb(job);
end $$;
revoke all on function public.enqueue_connection_import_job(text, text) from public, anon;
grant execute on function public.enqueue_connection_import_job(text, text) to authenticated;

-- File jobs: the app generates the job id first so the upload path can carry
-- it, uploads, then enqueues with that id. The row is only created here.
create function public.enqueue_file_import_job(p_job uuid, p_source text, p_files text[], p_entry text default 'import_page')
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs; path text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_job is null then raise exception 'Missing job id'; end if;
  if p_source in ('trakt','plex','simkl') then raise exception 'This source is a connection, not a file'; end if;
  if p_files is null or cardinality(p_files) = 0 then raise exception 'Choose a file to import'; end if;
  if cardinality(p_files) > 100 then raise exception 'Too many files'; end if;
  if p_entry not in ('onboarding','finishing_touches','import_page') then p_entry := 'import_page'; end if;
  if exists (select 1 from public.import_jobs where user_id = uid and status in ('queued','running','retry_wait')) then
    raise exception 'import_in_progress' using errcode = '23505';
  end if;
  foreach path in array p_files loop
    if path !~ ('^' || uid::text || '/' || p_job::text || '/[^/]+$') or path ~ '/_[^/]*$' then
      raise exception 'Invalid upload path';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'import-uploads' and name = path and owner_id = uid::text) then
      raise exception 'Upload not found';
    end if;
  end loop;
  insert into public.import_jobs(id, user_id, kind, source, entry, files)
    values (p_job, uid, 'file', p_source, p_entry, p_files)
    returning * into job;
  return to_jsonb(job);
end $$;
revoke all on function public.enqueue_file_import_job(uuid, text, text[], text) from public, anon;
grant execute on function public.enqueue_file_import_job(uuid, text, text[], text) to authenticated;

create function public.cancel_import_job(p_job uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.import_jobs set status = 'cancelled', lease_token = null, lease_until = null,
    finished_at = now(), updated_at = now()
  where id = p_job and user_id = auth.uid() and status in ('queued','running','retry_wait');
  return found;
end $$;
revoke all on function public.cancel_import_job(uuid) from public, anon;
grant execute on function public.cancel_import_job(uuid) to authenticated;

create function public.dismiss_import_job(p_job uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.import_jobs set seen_at = now(), updated_at = now()
  where id = p_job and user_id = auth.uid() and status in ('succeeded','partial','failed','cancelled');
  return found;
end $$;
revoke all on function public.dismiss_import_job(uuid) from public, anon;
grant execute on function public.dismiss_import_job(uuid) to authenticated;

-- ── Worker side ─────────────────────────────────────────────────────────────
-- A job is claimed under a lease. A lease that expires without a finish or a
-- fail (the function timed out) is reclaimable, and the checkpoint lets the
-- next tick carry on from the last slice rather than the start.
create function public.claim_import_job(p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs;
begin
  for job in select j.* from public.import_jobs j
    where (p_user is null or j.user_id = p_user)
    and ((j.status in ('queued','retry_wait') and j.available_at <= now()) or (j.status = 'running' and j.lease_until < now()))
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

-- A slice finished: record progress and extend the lease. Returns the row so
-- the worker sees a cancel. Raises on a stale lease so a timed-out run that
-- wakes up late cannot write over its successor.
create function public.progress_import_job(p_job uuid, p_lease uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs;
begin
  select * into job from public.import_jobs where id = p_job for update;
  if job.id is null then raise exception 'Unknown job'; end if;
  if job.status = 'cancelled' then return to_jsonb(job); end if;
  if job.status <> 'running' or job.lease_token is distinct from p_lease or job.lease_until <= now() then raise exception 'Stale job lease'; end if;
  update public.import_jobs set
    phase = coalesce(p_patch->>'phase', phase),
    checkpoint = coalesce(p_patch->'checkpoint', checkpoint),
    progress_done = coalesce((p_patch->>'progress_done')::integer, progress_done),
    progress_total = coalesce((p_patch->>'progress_total')::integer, progress_total),
    lease_until = now() + interval '3 minutes', updated_at = now()
  where id = job.id returning * into job;
  return to_jsonb(job);
end $$;
revoke all on function public.progress_import_job(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.progress_import_job(uuid, uuid, jsonb) to service_role;

-- The tick is over. Not done: back to the queue for the next tick. Done: the
-- counts decide between succeeded and partial.
create function public.finish_import_slice(p_job uuid, p_lease uuid, p_patch jsonb, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs; n_failed integer; n_review integer;
begin
  select * into job from public.import_jobs where id = p_job for update;
  if job.id is null then raise exception 'Unknown job'; end if;
  if job.status = 'cancelled' then return to_jsonb(job); end if;
  if job.status <> 'running' or job.lease_token is distinct from p_lease or job.lease_until <= now() then raise exception 'Stale job lease'; end if;
  n_failed := coalesce((p_patch->>'failed')::integer, job.failed);
  n_review := coalesce((p_patch->>'review_count')::integer, job.review_count);
  update public.import_jobs set
    phase = case when p_done then 'done' else coalesce(p_patch->>'phase', phase) end,
    checkpoint = coalesce(p_patch->'checkpoint', checkpoint),
    progress_done = coalesce((p_patch->>'progress_done')::integer, progress_done),
    progress_total = coalesce((p_patch->>'progress_total')::integer, progress_total),
    imported = coalesce((p_patch->>'imported')::integer, imported),
    duplicates = coalesce((p_patch->>'duplicates')::integer, duplicates),
    failed = n_failed,
    review_count = n_review,
    status = case when not p_done then 'queued' when n_failed > 0 or n_review > 0 then 'partial' else 'succeeded' end,
    attempts = 0, lease_token = null, lease_until = null, available_at = now(), updated_at = now(),
    finished_at = case when p_done then now() else null end,
    last_error = case when p_done then p_patch->>'last_error' else null end
  where id = job.id returning * into job;
  return to_jsonb(job);
end $$;
revoke all on function public.finish_import_slice(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.finish_import_slice(uuid, uuid, jsonb, boolean) to service_role;

create function public.fail_import_job(p_job uuid, p_lease uuid, p_error text, p_retry_seconds integer default 60, p_terminal boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.import_jobs set attempts = attempts + 1,
    status = case when p_terminal or attempts >= 5 then 'failed' else 'retry_wait' end,
    finished_at = case when p_terminal or attempts >= 5 then now() else null end,
    available_at = now() + make_interval(secs => greatest(1, least(3600, p_retry_seconds))),
    lease_token = null, lease_until = null, last_error = left(p_error, 500), updated_at = now()
  where id = p_job and status = 'running' and lease_token = p_lease and lease_until > now();
  return found;
end $$;
revoke all on function public.fail_import_job(uuid, uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.fail_import_job(uuid, uuid, text, integer, boolean) to service_role;

-- ── Scheduler ───────────────────────────────────────────────────────────────
-- Same shape as run_movie_release_notifications: pg_cron → pg_net → the edge
-- function, with the Vault bearer. The app also kicks the worker right after
-- enqueueing, so the minute cadence only matters once the user has left.
create or replace function public.run_import_worker_tick() returns void
language plpgsql security definer set search_path = public as $fn$
declare bearer text; base_url text;
begin
  select decrypted_secret into bearer from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'edge_webhook_base_url';
  if bearer is null or base_url is null then
    raise warning 'run_import_worker_tick: vault secrets missing; skipping this run';
    return;
  end if;
  -- Nothing to do most minutes: skip the HTTP round trip.
  if not exists (select 1 from public.import_jobs
    where (status in ('queued','retry_wait') and available_at <= now()) or (status = 'running' and lease_until < now())) then
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/import-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || bearer),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
end $fn$;
revoke all on function public.run_import_worker_tick() from public, anon, authenticated;
grant execute on function public.run_import_worker_tick() to service_role;

create extension if not exists pg_cron;

do $do$
begin
  -- scripts/db-migration-test.sh has no cron schema (see
  -- 20260913230451_schedule_pg_stat_statements_reset.sql). Skip out loud there.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling plot-import-worker';
    return;
  end if;
  perform cron.unschedule('plot-import-worker')
    where exists (select 1 from cron.job where jobname = 'plot-import-worker');
  perform cron.schedule('plot-import-worker', '* * * * *', $cron$select public.run_import_worker_tick()$cron$);
end
$do$;

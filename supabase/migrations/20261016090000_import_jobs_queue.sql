-- Imports queue instead of refusing. Onboarding's "Add another source" and
-- Settings' "Add a source" enqueue a second job while one runs; the worker
-- still takes one job per account at a time (the planner reads existing
-- history before it writes, so two concurrent imports would race that read).

drop index if exists public.import_jobs_one_open;

create or replace function public.enqueue_connection_import_job(p_source text, p_entry text default 'import_page')
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_source not in ('trakt','plex','simkl') then raise exception 'Unsupported connection source'; end if;
  if p_entry not in ('onboarding','finishing_touches','import_page','settings') then p_entry := 'import_page'; end if;
  -- One open job per source: a second click queues nothing new.
  select * into job from public.import_jobs
    where user_id = uid and source = p_source and status in ('queued','running','retry_wait')
    order by created_at limit 1;
  if found then return to_jsonb(job); end if;
  if not exists (select 1 from public.media_integrations where user_id = uid and provider = p_source and status = 'active') then
    raise exception 'Connect % first', p_source using errcode = '42501';
  end if;
  if (select count(*) from public.import_jobs where user_id = uid and status in ('queued','running','retry_wait')) >= 10 then
    raise exception 'import_queue_full' using errcode = '23505';
  end if;
  insert into public.import_jobs(user_id, kind, source, entry)
    values (uid, 'connection', p_source, p_entry)
    returning * into job;
  return to_jsonb(job);
end $$;

create or replace function public.enqueue_file_import_job(p_job uuid, p_source text, p_files text[], p_entry text default 'import_page')
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs; path text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_job is null then raise exception 'Missing job id'; end if;
  if p_source in ('trakt','plex','simkl') then raise exception 'This source is a connection, not a file'; end if;
  if p_files is null or cardinality(p_files) = 0 then raise exception 'Choose a file to import'; end if;
  if cardinality(p_files) > 100 then raise exception 'Too many files'; end if;
  if p_entry not in ('onboarding','finishing_touches','import_page','settings') then p_entry := 'import_page'; end if;
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
  insert into public.import_jobs(id, user_id, kind, source, entry, files)
    values (p_job, uid, 'file', p_source, p_entry, p_files)
    returning * into job;
  return to_jsonb(job);
end $$;

-- Claim the next due job, but never a second one for an account that already
-- has a job running under a live lease.
create or replace function public.claim_import_job(p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.import_jobs;
begin
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

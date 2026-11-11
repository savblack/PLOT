-- Let the read-only CI role see whether pg_cron jobs are running and passing.
--
-- WHY: a failed pg_cron run is only a row in cron.job_run_details, and a job
-- pg_cron stopped starting leaves no row at all. Nothing read either, so push
-- sends, email alerts or the import worker could stop without anyone noticing.
-- .github/workflows/cron-health.yml now checks every hour, as plot_ci_readonly.
--
-- WHY A FUNCTION AND NOT A GRANT: pg_cron puts row level security on both
-- tables, `username = current_user`. Every Plot job is owned by `postgres`, so
-- `grant select on cron.job to plot_ci_readonly` would let the role read zero
-- rows. Giving the role BYPASSRLS instead would let it read every table in the
-- database, and the CI checks refuse to run with that flag on purpose.
--
-- So this security definer function, owned by postgres, returns one row per job
-- with only names, schedules, timestamps and statuses. It never returns the job's
-- command or pg_cron's error text: the workflow runs in a public repository's
-- Actions log, and an error message can carry a URL or a value. Job names and
-- schedules are already public in this folder.
--
-- Execute goes to plot_ci_readonly only. Supabase grants execute on new public
-- functions to anon, authenticated and service_role by default, so all three
-- are revoked along with PUBLIC.
--
-- Read-only: it selects from two cron tables and writes nothing.

do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped cron_job_health()';
    return;
  end if;

  -- Created through execute so a database without pg_cron (the migration-test
  -- sandbox) skips it instead of failing on a reference to cron.job.
  execute $fn$
    create or replace function public.cron_job_health()
    returns table (
      jobname text,
      schedule text,
      active boolean,
      last_start timestamptz,
      last_status text,
      last_finished_status text,
      last_finished_at timestamptz,
      failed_last_day integer
    )
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      with latest as (
        select distinct on (d.jobid) d.jobid, d.start_time, d.status
        from cron.job_run_details d
        order by d.jobid, d.start_time desc nulls last
      ),
      finished as (
        select distinct on (d.jobid) d.jobid, d.status, d.end_time
        from cron.job_run_details d
        where d.status in ('succeeded', 'failed')
        order by d.jobid, d.start_time desc nulls last
      ),
      failures as (
        select d.jobid, count(*)::integer as n
        from cron.job_run_details d
        where d.status = 'failed' and d.start_time > now() - interval '1 day'
        group by d.jobid
      )
      select j.jobname::text, j.schedule::text, j.active,
             l.start_time, l.status::text,
             f.status::text, f.end_time,
             coalesce(x.n, 0)
      from cron.job j
      left join latest l on l.jobid = j.jobid
      left join finished f on f.jobid = j.jobid
      left join failures x on x.jobid = j.jobid
      order by j.jobname
    $body$
  $fn$;

  execute 'revoke all on function public.cron_job_health() from public, anon, authenticated, service_role';

  if exists (select 1 from pg_roles where rolname = 'plot_ci_readonly') then
    execute 'grant execute on function public.cron_job_health() to plot_ci_readonly';
  else
    raise notice 'plot_ci_readonly does not exist: cron_job_health() created with no caller';
  end if;

  execute $c$comment on function public.cron_job_health() is
    'One row per pg_cron job: schedule, active flag, latest run start and status, latest finished status, failures in the last day. No commands or error text. Read by .github/workflows/cron-health.yml as plot_ci_readonly.'$c$;
end
$do$;

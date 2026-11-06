-- Set three background job schedules on record. Production had drifted from
-- the migrations by hand (found by db:drift on 2026-11-06): brevo-lifecycle-sync
-- hourly instead of daily, marketing-notion-mirror every 15 minutes instead of
-- 5, plot-import-worker every 5 minutes instead of every minute. These are the
-- schedules Savannah chose on 2026-11-07:
--
--   brevo-lifecycle-sync     every 4 hours, at :27   (was 17 3 * * * here)
--   marketing-notion-mirror  every hour, at :41      (was */5 * * * *)
--   plot-import-worker       every 5 minutes         (was * * * * *)
--
-- :27 and :41 avoid the minutes other jobs use (send-push on the quarter
-- hours, push-receipts at 7/22/37/52, refresh-premium-badges at :17).
--
-- Schedule only. cron.alter_job leaves each job's command and active flag
-- untouched, and a job that does not exist is skipped rather than created, so
-- this cannot start a job on a project that deliberately has none.

do $do$
declare
  wanted constant jsonb := jsonb_build_object(
    'brevo-lifecycle-sync',    '27 */4 * * *',
    'marketing-notion-mirror', '41 * * * *',
    'plot-import-worker',      '*/5 * * * *'
  );
  job record;
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped background job schedules';
    return;
  end if;

  for job in
    select jobid, jobname from cron.job where wanted ? jobname
  loop
    perform cron.alter_job(job_id := job.jobid, schedule := wanted ->> job.jobname);
  end loop;
end
$do$;

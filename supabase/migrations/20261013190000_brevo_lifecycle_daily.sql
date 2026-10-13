-- brevo-lifecycle-sync runs once a day instead of hourly.
--
-- The dirty flags and brevo_sync_state are unchanged. Contacts still get
-- flagged within 15 minutes of activity; the cron just drains them once a
-- night. 03:17 UTC sits clear of the 21:00 alert jobs, the Sunday digest,
-- and the every-15-minute push jobs' top-of-hour ticks.
do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped rescheduling brevo-lifecycle-sync';
    return;
  end if;

  perform cron.unschedule('brevo-lifecycle-sync')
    where exists (select 1 from cron.job where jobname = 'brevo-lifecycle-sync');

  perform cron.schedule(
    'brevo-lifecycle-sync',
    '17 3 * * *',
    $cron$select public.run_brevo_lifecycle_sync()$cron$
  );
end
$do$;

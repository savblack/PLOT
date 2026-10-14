-- Background imports: the review file a job leaves (_review.json) is removed
-- when the user finishes the review, and swept by the worker after 30 days.
-- See docs/ops/background-imports.md.

-- The user finished a job's review (packages/core/importJobs.js removes the
-- file first, through the owner delete policy): nothing left to offer.
create or replace function public.finish_import_job_review(p_job uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.import_jobs set review_count = 0, seen_at = coalesce(seen_at, now()), updated_at = now()
  where id = p_job and user_id = auth.uid() and status in ('succeeded','partial','failed','cancelled');
  return found;
end $$;
revoke all on function public.finish_import_job_review(uuid) from public, anon;
grant execute on function public.finish_import_job_review(uuid) to authenticated;

-- Daily: ask the worker to delete review files older than 30 days. The worker
-- removes the objects through the Storage API (a plain delete from
-- storage.objects would leave the file itself behind) and zeroes review_count.
create or replace function public.run_import_review_sweep() returns void
language plpgsql security definer set search_path = public as $fn$
declare bearer text; base_url text;
begin
  select decrypted_secret into bearer from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'edge_webhook_base_url';
  if bearer is null or base_url is null then
    raise warning 'run_import_review_sweep: vault secrets missing; skipping this run';
    return;
  end if;
  if not exists (select 1 from public.import_jobs
    where review_count > 0 and status in ('succeeded','partial','failed','cancelled') and updated_at < now() - interval '30 days') then
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/import-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || bearer),
    body := '{"action":"sweep"}'::jsonb,
    timeout_milliseconds := 90000
  );
end $fn$;
revoke all on function public.run_import_review_sweep() from public, anon, authenticated;
grant execute on function public.run_import_review_sweep() to service_role;

do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling plot-import-review-sweep';
    return;
  end if;
  perform cron.unschedule('plot-import-review-sweep')
    where exists (select 1 from cron.job where jobname = 'plot-import-review-sweep');
  perform cron.schedule('plot-import-review-sweep', '40 4 * * *', $cron$select public.run_import_review_sweep()$cron$);
end
$do$;

-- Lighter background load on the production database. Two changes, both
-- additive in effect: no table change, no data rewrite.
--
-- Context: on 2026-11-10 production (then Nano, 0.5 GB) ran out of its disk
-- IO budget after a day of swapping, and requests timed out. It now runs on
-- Micro. These trim the steady write and storage load that does not need to
-- be there on any size.
--
-- 1. record_title_page_index refreshes last_seen_at at most once every 7 days
--    instead of every 24 hours. Same body as 20261102120000 with only that
--    interval changed (diffed against live with db:function-diff). The only
--    reader is the daily titles sitemap, which orders by last_seen_at and caps
--    the file at 45,000 URLs; the table is about 24k rows, so a week of
--    staleness drops nothing. A renamed title still writes at once. Every
--    refresh is a non-HOT update (title_page_index_last_seen_idx moves), and
--    about half the table was being rewritten each day.
--
-- 2. pg_cron keeps every run in cron.job_run_details forever. It was 9.9 MB,
--    the second-largest object in the database, from ~600 runs a day. A daily
--    job deletes rows older than 7 days, at 03:53 UTC (no other job uses :53,
--    and it is after the 03:17 backup). Skipped where there is no cron schema.
--
-- redefines: record_title_page_index (interval only; ON CONFLICT target unchanged)

create or replace function public.record_title_page_index(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  with incoming as (
    select distinct on (r.media_type, r.tmdb_id)
      r.media_type,
      r.tmdb_id,
      r.title
    from jsonb_array_elements(p_rows) with ordinality as e(item, ord)
    cross join lateral jsonb_to_record(
      case when jsonb_typeof(e.item) = 'object' then e.item else '{}'::jsonb end
    ) as r(media_type text, tmdb_id integer, title text)
    where r.media_type in ('movie', 'tv')
      and r.tmdb_id > 0
      and r.title is not null
    order by r.media_type, r.tmdb_id, e.ord
  ),
  upserted as (
    insert into public.title_page_index (media_type, tmdb_id, title, last_seen_at)
    select media_type, tmdb_id, title, now()
    from incoming
    on conflict (media_type, tmdb_id) do update
      set title = excluded.title,
          last_seen_at = excluded.last_seen_at
      where public.title_page_index.last_seen_at < now() - interval '7 days'
         or public.title_page_index.title is distinct from excluded.title
    returning 1
  )
  select count(*)::integer into n from upserted;

  return n;
end;
$fn$;

revoke all on function public.record_title_page_index(jsonb) from public, anon, authenticated;
grant execute on function public.record_title_page_index(jsonb) to service_role;

comment on function public.record_title_page_index(jsonb) is
  'Insert title-page index rows, or refresh them when last_seen_at is older than 7 days or the stored title changed. Service role only.';

do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped cron-history-purge';
    return;
  end if;

  perform cron.unschedule('cron-history-purge')
    where exists (select 1 from cron.job where jobname = 'cron-history-purge');
  perform cron.schedule(
    'cron-history-purge',
    '53 3 * * *',
    $cron$delete from cron.job_run_details where end_time < now() - interval '7 days'$cron$
  );
end
$do$;

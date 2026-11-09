-- Additive. New function only. No table change and no rewrite of existing rows.
--
-- The title-page edge function upserted public.title_page_index on every
-- render, which rewrote last_seen_at and its index even when the row was
-- already current. From 25 Oct 2026 that was about 459k updates on a 23k-row
-- table, the largest writer on the Nano instance.
--
-- record_title_page_index inserts a missing row. On conflict it updates only
-- when last_seen_at is older than 24 hours, or when title differs. The
-- primary key (media_type, tmdb_id) cannot change on conflict, so title is
-- the only other column this write carries. A skipped update does not create
-- a new row version and does not move title_page_index_last_seen_idx.
--
-- The only reader is the daily titles sitemap in the title-page function. It
-- orders by last_seen_at and caps the file at 45,000 URLs. The table is
-- about 23k rows, so a day of staleness does not drop a URL. No cleanup job
-- reads this column.

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
      where public.title_page_index.last_seen_at < now() - interval '24 hours'
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
  'Insert title-page index rows, or refresh them when last_seen_at is older than 24 hours or the stored title changed. Service role only.';

-- The titles sitemap (title-page?sitemap=1) was built live on every request:
-- 21 TMDB fetches, up to 45 pages of title_page_index, and a service-role
-- upsert, on a public function whose only guard was the Pages proxy's edge
-- cache, which any extra query parameter bypassed. Found in the 2026-10-13
-- security review.
--
-- The sitemap is now generated once a day by pg_cron (through the Vault bearer
-- the other scheduled functions use) and stored here. A public request serves
-- the stored copy; only the cron caller, carrying the service key, rebuilds it.

create table if not exists public.title_sitemap_cache (
  id           smallint    primary key default 1 check (id = 1),
  xml          text        not null,
  url_count    integer     not null default 0,
  generated_at timestamptz not null default now()
);

alter table public.title_sitemap_cache enable row level security;
drop policy if exists "title_sitemap_cache is server-only" on public.title_sitemap_cache;
create policy "title_sitemap_cache is server-only"
  on public.title_sitemap_cache for select using (false);
revoke all on public.title_sitemap_cache from anon, authenticated;

create or replace function public.run_title_sitemap_refresh() returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bearer   text;
  base_url text;
begin
  select decrypted_secret into bearer
    from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_webhook_base_url';

  if bearer is null or base_url is null then
    raise warning 'run_title_sitemap_refresh: vault secrets missing; skipping this run';
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/title-page?sitemap=refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$fn$;

revoke execute on function public.run_title_sitemap_refresh() from public, anon, authenticated;

comment on function public.run_title_sitemap_refresh() is
  'Daily pg_cron caller for title-page?sitemap=refresh. Rebuilds title_sitemap_cache with the service bearer from Vault.';

do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling title-sitemap-refresh';
    return;
  end if;

  perform cron.unschedule('title-sitemap-refresh')
    where exists (select 1 from cron.job where jobname = 'title-sitemap-refresh');

  -- 02:20 UTC, before the Pages proxy's one-day sitemap cache window rolls over
  -- for most crawlers and well clear of the other nightly jobs.
  perform cron.schedule(
    'title-sitemap-refresh',
    '20 2 * * *',
    $cron$select public.run_title_sitemap_refresh()$cron$
  );
end
$do$;

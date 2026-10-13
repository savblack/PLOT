-- Titles the public title pages (theplot.tv/movie|tv/<slug>) have rendered or
-- linked to in "More like this", so sitemap-titles.xml can list them.
--
-- The sitemap was seeded only from marketing_tracked_titles, the latest
-- trending snapshot and TMDB's discovery feeds. Every title page links twelve
-- related titles, so crawlers kept finding indexable pages the sitemap never
-- named (1,905 in the October 2026 site audit). The title-page function
-- upserts a row for the page and each related title it links; the sitemap
-- reads the most recently seen.
--
-- Public TMDB metadata only: no user, no viewer, no request data.

create table if not exists public.title_page_index (
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  title text not null,
  last_seen_at timestamptz not null default now(),
  primary key (media_type, tmdb_id)
);

create index if not exists title_page_index_last_seen_idx
  on public.title_page_index (last_seen_at desc);

alter table public.title_page_index enable row level security;
drop policy if exists "title_page_index is server-only" on public.title_page_index;
create policy "title_page_index is server-only"
  on public.title_page_index for select using (false);

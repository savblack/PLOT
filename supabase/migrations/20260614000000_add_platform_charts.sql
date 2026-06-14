-- Official streaming platform Top 10 charts (currently Netflix only).
-- Populated weekly by scripts/sync-netflix-top10.mjs from Netflix's public
-- Tudum data feed. Non-personal, public data: readable by anyone, written only
-- by the service role (which bypasses RLS), so no insert/update policy is added.

create table if not exists platform_charts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,                       -- e.g. 'netflix'
  region text not null,                         -- ISO 3166-1 alpha-2, e.g. 'US'
  media_type text not null check (media_type in ('movie', 'tv')),
  rank integer not null,
  week date not null,                            -- Netflix "week" (Sunday date)
  title text not null,                           -- source title from Netflix
  tmdb_id integer,
  tmdb_title text,
  poster_path text,
  match_state text not null default 'unmatched' check (match_state in ('matched', 'unmatched')),
  cumulative_weeks integer,
  updated_at timestamptz not null default now(),
  unique (platform, region, media_type, week, rank)
);

create index if not exists platform_charts_lookup_idx
  on platform_charts (platform, region, week, media_type, rank);

alter table platform_charts enable row level security;

create policy "platform charts are publicly readable"
  on platform_charts for select using (true);

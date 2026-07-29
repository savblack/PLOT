-- Cached critic scores (Rotten Tomatoes %, via OMDb), keyed by IMDb id.
-- OMDb's free tier caps at ~1,000 req/day and RT scores rarely change, so the
-- critic-score Edge Function reads this cache before ever calling OMDb.
-- Non-personal, public data: readable by anyone, written only by the service
-- role (which bypasses RLS), so no insert/update policy is added.

create table if not exists critic_scores (
  imdb_id text primary key,             -- e.g. 'tt15239678'
  critic_score smallint,                -- Rotten Tomatoes %, null if OMDb has none
  source text,                          -- e.g. 'Rotten Tomatoes'
  fetched_at timestamptz not null default now()
);

alter table critic_scores enable row level security;

create policy "critic scores are publicly readable"
  on critic_scores for select using (true);

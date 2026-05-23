-- watching_progress: tracks which episode the user is up to for in-progress TV shows

create table if not exists watching_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  tmdb_id          integer not null,
  title            text not null,
  poster_path      text,
  current_season   integer not null default 1,
  current_episode  integer not null default 1,
  total_episodes   integer,     -- episodes in current season, updated from TMDB
  total_seasons    integer,     -- total seasons, updated from TMDB
  started_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique(user_id, tmdb_id)
);

-- Row-level security
alter table watching_progress enable row level security;

create policy "Users can manage their own watching progress"
  on watching_progress
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast user lookups
create index if not exists watching_progress_user_idx
  on watching_progress(user_id);

-- Auto-update updated_at
create or replace function update_watching_progress_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists watching_progress_updated_at on watching_progress;
create trigger watching_progress_updated_at
  before update on watching_progress
  for each row execute function update_watching_progress_updated_at();

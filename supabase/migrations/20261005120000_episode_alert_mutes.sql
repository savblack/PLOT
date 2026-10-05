-- Per-show off switch for new-episode notifications (the title panel's
-- "Episode alerts" toggle). Everyone following a show is notified by default
-- (new-episode-notifications); a row here turns it off for that one show.
-- Free for everyone: muting is never gated. tmdb_id always comes from the
-- title panel's TMDB details.
--
-- Only a new table: no existing function or policy is redefined.
create table if not exists public.episode_alert_mutes (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  tmdb_id    integer not null check (tmdb_id > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);
-- The daily job reads mutes by show.
create index if not exists episode_alert_mutes_show_idx on public.episode_alert_mutes (tmdb_id);

alter table public.episode_alert_mutes enable row level security;

-- Read, add and remove your own. No update policy: a mute is added or removed.
drop policy if exists "own episode alert mutes readable" on public.episode_alert_mutes;
create policy "own episode alert mutes readable" on public.episode_alert_mutes
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own episode alert mutes insertable" on public.episode_alert_mutes;
create policy "own episode alert mutes insertable" on public.episode_alert_mutes
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own episode alert mutes deletable" on public.episode_alert_mutes;
create policy "own episode alert mutes deletable" on public.episode_alert_mutes
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.episode_alert_mutes from anon;
grant select, insert, delete on public.episode_alert_mutes to authenticated;

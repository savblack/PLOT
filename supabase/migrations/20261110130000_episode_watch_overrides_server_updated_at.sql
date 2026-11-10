-- episode_watch_overrides.updated_at: always the server's time.
--
-- The Watching list's "Last watched" order reads this column
-- (packages/core/watchingActivity.js), and the only writer
-- (packages/core/episodeWatches.js saveEpisodeWatches) used to send the
-- device's clock. A phone running fast pinned a show to the front; one
-- running slow left it where it was. The table had no trigger, so an upsert
-- that hit an existing row kept whatever the client sent.
--
-- New function and trigger; nothing is redefined. Unlike watching_progress
-- (20261110120000) there is no undo that restores an old time here, so the
-- stamp is unconditional.
create function public.set_episode_watch_override_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger episode_watch_overrides_updated_at
  before insert or update on public.episode_watch_overrides
  for each row execute function public.set_episode_watch_override_updated_at();

-- Trigger functions are not callable over PostgREST (20261012130000). The
-- trigger still fires: Postgres does not check EXECUTE for trigger calls.
revoke execute on function public.set_episode_watch_override_updated_at() from public, anon, authenticated;

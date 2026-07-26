-- Fix: history's rewatch-uniqueness constraint is (user_id, tmdb_id, watched_at)
-- only — it does not include media_type. TMDB movie IDs and TV IDs are separate
-- numbering sequences that routinely collide (e.g. movie 262 and tv 262 are
-- entirely different titles). If a user marks a movie and a TV show watched on
-- the same date and their tmdb_id happens to collide, the second upsert
-- (packages/core/userMedia.js logWatchedItem, onConflict 'user_id,tmdb_id,watched_at')
-- silently overwrites the first row's title/poster/media_type/rating/note —
-- symptom: a previously-watched title's card shows a completely unrelated
-- title/poster. Widening the constraint (and the app's upsert onConflict
-- target, updated alongside this migration) to include media_type makes a
-- movie and a TV show with the same tmdb_id independent rows, as they always
-- should have been.
alter table history
  drop constraint if exists history_user_id_tmdb_id_watched_at_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'history_user_id_tmdb_id_media_type_watched_at_key'
  ) then
    alter table history
      add constraint history_user_id_tmdb_id_media_type_watched_at_key
      unique (user_id, tmdb_id, media_type, watched_at);
  end if;
end $$;

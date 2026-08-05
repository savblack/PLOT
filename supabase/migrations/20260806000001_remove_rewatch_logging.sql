-- Remove rewatch logging: one history row per title, always.
--
-- Reverts the product decision in 20260725000001_preserve_repeat_watches.sql
-- (SUS-66). Watching something again updates the entry already there instead of
-- adding a second one, so `watched_at` leaves the unique key:
--   (user_id, tmdb_id, media_type, watched_at) → (user_id, tmdb_id, media_type)
--
-- The log_rewatches preference that used to select between these two behaviours
-- is already gone (20260805000000). This removes the behaviour it defaulted to.
--
-- Production has 13 history rows and no (user_id, tmdb_id, media_type) group
-- holding more than one, so the collapse below changes nothing today. It runs
-- anyway: rows could appear between writing this and applying it, and it keeps
-- the migration correct if re-run against a database that does have some.

-- Keep the most recent watch of each title, drop the earlier ones. The survivor
-- is the row every surface already treated as current — useHistory's
-- updateEntry/removeEntry target the newest row, and the list is ordered
-- watched_at desc.
delete from public.history h
 using public.history keep
 where h.user_id = keep.user_id
   and h.tmdb_id = keep.tmdb_id
   and h.media_type = keep.media_type
   and (
     -- Newer watch wins; id breaks the tie, since watched_at is nullable.
     keep.watched_at > h.watched_at
     or (keep.watched_at is not distinct from h.watched_at and keep.id > h.id)
   );

alter table public.history
  drop constraint if exists history_user_id_tmdb_id_media_type_watched_at_key;

alter table public.history
  add constraint history_user_id_tmdb_id_media_type_key
  unique (user_id, tmdb_id, media_type);

-- feed_post_from_history() is deliberately left alone. Its DELETE branch checks
-- whether another history row for the title survives before retiring the feed
-- post — a guard that only ever mattered for rewatches, and one that is now
-- always true by the time an AFTER trigger sees it. That makes it dead, not
-- wrong. `create or replace function` on this exact function is what caused the
-- 2026-07-25 → 08-03 outage, when 20260725000001 pasted a stale body and
-- silently reverted its ON CONFLICT target. Not worth reopening to delete four
-- lines that cost one index lookup.

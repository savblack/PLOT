-- history.rating is numeric(2,1), which tops out at 9.9. The table predates
-- supabase/migrations, so no file here declares that type; it was confirmed
-- against production's information_schema on 2026-09-25.
--
-- Ratings have been on a 1-10 scale since 20260528000000 (packages/core/
-- ratings.js: MAX_RATING = 10, five stars = 10). Every client path writes 10
-- for a five-star rating (web half-stars, mobile StarRow, Letterboxd import),
-- and each one fails with 22003 "numeric field overflow":
--   * logWatchedItem: the whole watch fails, not just the rating
--   * updateEntry: the error is discarded, so the edit silently doesn't save
--   * writeImportRows: the whole 50-row batch containing the title fails
--
-- numeric(3,1) keeps the same scale, so existing values are unchanged and
-- Postgres relaxes the typmod without rewriting the table. It still takes an
-- ACCESS EXCLUSIVE lock for the catalog update; lock_timeout makes this fail
-- fast instead of queueing every history read behind a long transaction.
-- No view, index, rule or publication depends on the column (checked on
-- production 2026-09-25). feed_posts.rating, which trg_feed_post_from_history
-- copies into, is already unconstrained numeric.

set lock_timeout = '5s';

alter table public.history
  alter column rating type numeric(3,1);

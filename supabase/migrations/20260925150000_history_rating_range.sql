-- Cap history.rating at the 1-10 scale the apps store (packages/core/
-- ratings.js: MAX_RATING = 10, five stars = 10). 20260925140000 widened the
-- column to numeric(3,1) so a five-star 10 fits, which also let it hold up to
-- 99.9. Every current writer clamps to 1-10 (normalizeRating, the Letterboxd
-- and IMDb importers), but nothing in the database did, and
-- trg_feed_post_from_history copies whatever lands here into feed_posts.
--
-- Null stays allowed: an unrated watch stores null, never 0.
--
-- Adding the constraint checks every existing row. history is ~40 rows
-- (112 kB) on production as of 2026-09-25, so the scan is instant; lock_timeout
-- still makes this fail fast rather than queue behind a long transaction. If an
-- existing row were out of range this would fail and roll back, changing
-- nothing; db:migration-test against a production copy is what proved it
-- doesn't.

set lock_timeout = '5s';

alter table public.history
  add constraint history_rating_range check (rating between 1 and 10);

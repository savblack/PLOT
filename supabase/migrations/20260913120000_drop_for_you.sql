-- Remove the "For You" recommendation pipeline entirely.
--
-- WHY
-- Tier 1 (cross-user collaborative filtering) never produced a single row.
-- recompute_title_similarity() gates pairs on co_count >= 2 — two distinct
-- users having signalled the same *pair* of titles — and user_title_signals
-- holds ~80 rows across ~57 users, about 1.4 titles each. A user with k titles
-- contributes C(k,2) pairs, so almost nobody contributes a pair at all, let
-- alone the same pair as someone else. The gate was never wrong; there was
-- simply never enough data for it to match, and PLOT being dark to the public
-- means the corpus cannot grow either. Everything rested on that: the TMDB
-- tier and the genre tier were carrying the whole feature, and neither needs
-- this machinery.
--
-- NO USER DATA IS DROPPED HERE. All three objects are derived:
-- user_title_signals is a materialized view over list_items, user_favourites
-- and history; title_similarity and content_similarity are caches rebuilt from
-- those same tables plus TMDB. The source tables are untouched, and genre_ids
-- stays populated on both of them — it also backs the Discover genre filter,
-- which is independent of this feature (see apps/web/tests/unit/mediaGenres.test.js).
--
-- TO BRING IT BACK: revert the commit that added this migration. The four
-- original migrations (20260726020000, 20260727000000, 20260729010000,
-- 20260729020000) are still in git history and recreate every object. The only thing not
-- recoverable from git is content_similarity's cached TMDB recommendations,
-- which the nightly job rebuilds at 50 titles a night — roughly two nights at
-- the current signal volume.

-- Functions first: get_for_you() and the two service-role helpers read the
-- objects dropped below.
drop function if exists get_for_you(integer);
drop function if exists recompute_title_similarity();
drop function if exists for_you_content_similarity_gaps(integer);

drop table if exists title_similarity;
drop table if exists content_similarity;

-- Dropped last — the functions above referenced it.
drop materialized view if exists user_title_signals;

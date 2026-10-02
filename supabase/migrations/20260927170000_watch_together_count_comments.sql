-- Correct the record on Watch together's "in common" counts. Documentation
-- only: no function body, policy or row changes.
--
-- 20260927150000_watch_together_counts_for_followers.sql says the overlap
-- count is shown to accepted followers of a private profile, because they can
-- read its watchlist through can_view_profile. That stopped being true one
-- migration later: 20260927160000_watchlist_visibility.sql gave the watchlist
-- its own setting and recreated both functions with can_view_watchlist, so a
-- follower sees the count only when the owner's "Who can see your Want to
-- Watch" lets them see the watchlist itself (a private profile starts at only
-- me). Production and Staging both run the 20260927160000 bodies.
--
-- 20260927150000 is already applied, so it is left as written; the rule now
-- lives on the functions themselves, where pg_get_functiondef readers see it.

comment on function public.suggest_watch_together() is
  'Suggested people to watch together with. overlap_count is returned only when the caller can see that person''s watchlist (can_view_watchlist, 20260927160000), not merely their profile. Block-filtered; see scripts/check-block-clause.mjs.';

comment on function public.watch_together_status(uuid) is
  'Pairing state with another person. overlap_count is returned when paired, or otherwise only when the caller can see that person''s watchlist (can_view_watchlist, 20260927160000), not merely their profile.';

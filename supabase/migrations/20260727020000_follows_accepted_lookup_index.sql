-- is_accepted_follower() (20260621140000) filters on
-- (following_id, follower_id, status), but the only supporting index is on
-- following_id alone, plus a PK ordered (follower_id, following_id) that
-- doesn't match this predicate's leading column. Fine at today's scale, but
-- for a popular account with a large follower count this degrades to an
-- index-scan-plus-filter over every one of their followers, run per row of
-- every private-profile query (journal/top-lists/favourites RLS). A
-- composite index matching the predicate exactly keeps this an O(1) lookup
-- regardless of follower count.
create index if not exists follows_accepted_lookup_idx
  on public.follows (following_id, follower_id)
  where status = 'accepted';

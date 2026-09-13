-- For You: stop serving tier 1 (cross-user collaborative filtering) until the
-- user base can actually produce it.
--
-- THE MEASUREMENT (production, 2026-09-13, read-only)
-- public.title_similarity is empty and always has been. The cause is the
-- `co_count >= 2` gate in recompute_title_similarity(): a pair of titles only
-- earns a row when at least 2 distinct users have signalled on BOTH titles.
--
--   candidate pairs today:            705, every one of them co_count = 1
--   users with >= 2 signals:          6 of 29 signalling users (23 have exactly 1)
--   pairs contributed by one user:    666 of 705 (94%)
--   titles signalled by >1 user:      2 of 71
--
-- The gate is not merely too high, it is unreachable. Re-running the same
-- count over the BROADEST signal definition available — every list_items row,
-- every user_favourites row and every history row regardless of rating or dnf,
-- i.e. strictly more than any reweighting could ever admit — still yields
-- 1580 pairs and still not one with co_count >= 2. 84 of 89 titles have
-- exactly one user. The overlap graph is two stars, not a mesh.
--
-- WHY NOT JUST LOWER THE GATE
-- `co_count >= 1` is the only value that yields rows, and it makes the table
-- one person's co-occurrence list: 94% of pairs come from a single 37-title
-- account. It would fire tier 1 for 8 users and, because tier 1 short-circuits
-- ahead of tier 2, divert them OFF content_similarity — which works today for
-- all 29 signalling users (740 cached rows). Strictly worse recommendations,
-- dressed as collaborative filtering. Scaling the gate with user count lands
-- on 2 at this scale, i.e. changes nothing.
--
-- WHAT CHANGES
-- Only get_for_you(), and only by deleting the tier-1 branch: TMDB content
-- similarity becomes the first tier, genre overlap stays the fallback. Both
-- already emit 'similar_to_your_titles' / 'because_you_like_these_genres', so
-- no user-facing reason string changes. This also drops a count(*) against
-- title_similarity that ran on every call, for every user, to return 0.
--
-- WHY recompute_title_similarity() KEEPS RUNNING
-- It must, regardless of this change: its `refresh materialized view
-- user_title_signals` is load-bearing for BOTH remaining tiers. Keeping its
-- insert too makes the revival trigger self-announcing — the day
-- title_similarity stops being empty is the day real cross-user overlap
-- exists and this tier is worth restoring, and restoring it means re-adding
-- the branch to get_for_you() ahead of the content tier.
--
-- But an unread table must not be an unbounded one. The pair self-join is
-- sum(n_u^2) over users: the single 37-title account above already produces
-- 666 of the 705 pairs, and at 2000 titles that one account alone would write
-- ~2M rows a night to a table nobody reads. That cost arrives long before the
-- overlap does. So the pair source is now capped at each user's 200 strongest
-- signals, which bounds any one account to 200*199/2 = 19,900 pairs.
--
-- 200 is a detection-era cap, not a recommendation-quality one. The table's
-- only job right now is to answer "has cross-user overlap appeared yet?", and
-- a user's 200 strongest signals answer that with room to spare. Revisit it
-- when the tier is actually served again: at that point the cap is a quality
-- knob, and the thing to bound will be total users, not one power user.
--
-- The cap is applied to the popularity denominator as well as to the pairs,
-- so the cosine normalization stays consistent with the set it is counting.
-- Rescoring is free to do here precisely because nothing reads the table.

create or replace function get_for_you(p_limit integer default 20)
returns table (tmdb_id integer, media_type text, relevance numeric, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_content_hits integer;
  v_pool_size integer := greatest(p_limit * 4, 60);
  v_seed double precision;
begin
  if v_user_id is null then
    return;
  end if;

  v_seed := (hashtext(v_user_id::text || to_char(current_date, 'YYYYMMDD')) % 2147483647)::double precision / 2147483647.0;
  perform setseed(v_seed);

  select count(*) into v_content_hits
  from user_title_signals uts
  join content_similarity cs
    on cs.tmdb_id_a = uts.tmdb_id and cs.media_type_a = uts.media_type
  where uts.user_id = v_user_id
    and not exists (
      select 1 from user_title_signals seen
      where seen.user_id = v_user_id
        and seen.tmdb_id = cs.tmdb_id_b and seen.media_type = cs.media_type_b
    );

  if v_content_hits > 0 then
    return query
    with pool as (
      select cs.tmdb_id_b as tmdb_id, cs.media_type_b as media_type,
             sum(cs.score * uts.weight) as relevance, 'similar_to_your_titles' as reason
      from user_title_signals uts
      join content_similarity cs
        on cs.tmdb_id_a = uts.tmdb_id and cs.media_type_a = uts.media_type
      where uts.user_id = v_user_id
        and not exists (
          select 1 from user_title_signals seen
          where seen.user_id = v_user_id
            and seen.tmdb_id = cs.tmdb_id_b and seen.media_type = cs.media_type_b
        )
      group by cs.tmdb_id_b, cs.media_type_b
      order by relevance desc
      limit v_pool_size
    )
    select * from pool
    order by random()
    limit p_limit;
    return;
  end if;

  return query
  with liked_genres as (
    select array_agg(distinct g) as genres
    from user_title_signals, unnest(genre_ids) as g
    where user_id = v_user_id
  ),
  pool as (
    select uts.tmdb_id, uts.media_type,
           ((select count(*) from unnest(uts.genre_ids) g where g = any(lg.genres))::numeric * uts.weight) as relevance,
           'because_you_like_these_genres' as reason
    from user_title_signals uts, liked_genres lg
    where lg.genres is not null
      and uts.genre_ids && lg.genres
      and not exists (
        select 1 from user_title_signals seen
        where seen.user_id = v_user_id
          and seen.tmdb_id = uts.tmdb_id and seen.media_type = uts.media_type
      )
    group by uts.tmdb_id, uts.media_type, uts.genre_ids, uts.weight, lg.genres
    order by relevance desc
    limit v_pool_size
  )
  select * from pool
  order by random()
  limit p_limit;
end;
$$;

-- Redefined from the body live on production as of 2026-09-13 (verified with
-- `npm run db:function-diff`). The only changes are the `capped` CTE and the
-- two references that now read from it instead of user_title_signals directly.
create or replace function recompute_title_similarity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view user_title_signals;

  delete from title_similarity where true;

  insert into title_similarity (tmdb_id_a, media_type_a, tmdb_id_b, media_type_b, score)
  with capped as (
    -- Bound each user's contribution to the O(n^2) self-join below. Ordered by
    -- signal strength so a power user's favourites and high ratings survive the
    -- cut and their long watchlist tail is what gets dropped. The tmdb_id /
    -- media_type tiebreak keeps the cut deterministic across nightly runs.
    select user_id, tmdb_id, media_type, weight
    from (
      select uts.user_id, uts.tmdb_id, uts.media_type, uts.weight,
             row_number() over (
               partition by uts.user_id
               order by uts.weight desc, uts.tmdb_id, uts.media_type
             ) as rn
      from user_title_signals uts
    ) ranked
    where rn <= 200
  ),
  pairs as (
    select
      a.tmdb_id as tmdb_id_a, a.media_type as media_type_a,
      b.tmdb_id as tmdb_id_b, b.media_type as media_type_b,
      count(*) as co_count,
      sum(least(a.weight, b.weight)) as co_weight
    from capped a
    join capped b
      on a.user_id = b.user_id
     and (a.tmdb_id, a.media_type) < (b.tmdb_id, b.media_type)
    group by 1, 2, 3, 4
  ),
  popularity as (
    select tmdb_id, media_type, sum(weight) as total_weight
    from capped
    group by 1, 2
  )
  select
    p.tmdb_id_a, p.media_type_a, p.tmdb_id_b, p.media_type_b,
    p.co_weight / sqrt(pa.total_weight * pb.total_weight) as score
  from pairs p
  join popularity pa on pa.tmdb_id = p.tmdb_id_a and pa.media_type = p.media_type_a
  join popularity pb on pb.tmdb_id = p.tmdb_id_b and pb.media_type = p.media_type_b
  where p.co_count >= 2;
end;
$$;

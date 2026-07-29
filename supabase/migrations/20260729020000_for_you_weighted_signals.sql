-- For You relevance fix: every signal in user_title_signals (watchlist add,
-- favourite, history rating >= 7) has counted equally so far, both when
-- building title_similarity (cross-user co-occurrence) and when scoring a
-- specific user's candidates in get_for_you(). That flattens very different
-- strengths of "liked it" into one bucket — a watchlist add is pure intent
-- (haven't watched it, might not like it), a favourite is an explicit strong
-- endorsement, and a history rating is confirmed enjoyment whose magnitude
-- (7/10 vs 10/10) should matter. Adding a per-signal weight lets both the
-- shared similarity table and the per-user relevance score reflect that.
--
-- Weights: watchlist 0.5 (weakest — intent only), history rating scaled
-- 0.7-1.0 (confirmed enjoyment, magnitude-scaled), favourite 1.5 (strongest
-- — explicit "this is a favourite" signal, not just a passing high rating).

drop materialized view if exists user_title_signals;

create materialized view user_title_signals as
with raw as (
  select user_id, tmdb_id, media_type, coalesce(genre_ids, '{}'::integer[]) as genre_ids,
         0.5::numeric as weight
  from list_items
  union all
  select user_id, tmdb_id, media_type, '{}'::integer[] as genre_ids,
         1.5::numeric as weight
  from user_favourites
  union all
  select user_id, tmdb_id, media_type, coalesce(genre_ids, '{}'::integer[]) as genre_ids,
         (rating::numeric / 10.0) as weight
  from history
  where rating >= 7 and (dnf is null or dnf = false)
),
-- A title can appear in more than one source (e.g. watchlisted, then later
-- rated) — merge those into a single row per (user, title) rather than
-- letting the unique index below reject the duplicate: take the strongest
-- weight across sources and the union of every genre_ids array seen.
genres as (
  select user_id, tmdb_id, media_type, array_agg(distinct g) as genre_ids
  from raw, unnest(genre_ids) as g
  group by 1, 2, 3
),
weights as (
  select user_id, tmdb_id, media_type, max(weight) as weight
  from raw
  group by 1, 2, 3
)
select w.user_id, w.tmdb_id, w.media_type,
       coalesce(g.genre_ids, '{}'::integer[]) as genre_ids,
       w.weight
from weights w
left join genres g using (user_id, tmdb_id, media_type);

create unique index if not exists user_title_signals_uniq
  on user_title_signals (user_id, tmdb_id, media_type);

-- Weighted co-occurrence: a pair is only as strong as its weaker signal
-- (least(a.weight, b.weight)) — two titles someone merely watchlisted
-- shouldn't score as high as two titles they both rated 9/10. Popularity
-- normalization sums weight instead of raw counts for the same reason.
-- The co_count >= 2 gate is unchanged (still requires at least 2 users
-- co-signalling the pair, regardless of weight) to keep the same noise
-- floor as before.
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
  with pairs as (
    select
      a.tmdb_id as tmdb_id_a, a.media_type as media_type_a,
      b.tmdb_id as tmdb_id_b, b.media_type as media_type_b,
      count(*) as co_count,
      sum(least(a.weight, b.weight)) as co_weight
    from user_title_signals a
    join user_title_signals b
      on a.user_id = b.user_id
     and (a.tmdb_id, a.media_type) < (b.tmdb_id, b.media_type)
    group by 1, 2, 3, 4
  ),
  popularity as (
    select tmdb_id, media_type, sum(weight) as total_weight
    from user_title_signals
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

-- Personalize relevance by how strongly *this* user signalled on their side
-- of the match: sum(score * uts.weight) instead of sum(score), so a title
-- similar to something the user only watchlisted counts for less than one
-- similar to something they favourited or rated highly. Same idea applied
-- to the genre fallback, weighted by the candidate row's own signal
-- strength (other users' watchlist adds shouldn't outrank their favourites
-- when both merely overlap on genre).
create or replace function get_for_you(p_limit integer default 20)
returns table (tmdb_id integer, media_type text, relevance numeric, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_similarity_hits integer;
  v_content_hits integer;
  v_pool_size integer := greatest(p_limit * 4, 60);
  v_seed double precision;
begin
  if v_user_id is null then
    return;
  end if;

  v_seed := (hashtext(v_user_id::text || to_char(current_date, 'YYYYMMDD')) % 2147483647)::double precision / 2147483647.0;
  perform setseed(v_seed);

  select count(*) into v_similarity_hits
  from user_title_signals uts
  join title_similarity s
    on s.tmdb_id_a = uts.tmdb_id and s.media_type_a = uts.media_type
  where uts.user_id = v_user_id
    and not exists (
      select 1 from user_title_signals seen
      where seen.user_id = v_user_id
        and seen.tmdb_id = s.tmdb_id_b and seen.media_type = s.media_type_b
    );

  if v_similarity_hits > 0 then
    return query
    with pool as (
      select s.tmdb_id_b as tmdb_id, s.media_type_b as media_type,
             sum(s.score * uts.weight) as relevance, 'similar_to_your_titles' as reason
      from user_title_signals uts
      join title_similarity s
        on s.tmdb_id_a = uts.tmdb_id and s.media_type_a = uts.media_type
      where uts.user_id = v_user_id
        and not exists (
          select 1 from user_title_signals seen
          where seen.user_id = v_user_id
            and seen.tmdb_id = s.tmdb_id_b and seen.media_type = s.media_type_b
        )
      group by s.tmdb_id_b, s.media_type_b
      order by relevance desc
      limit v_pool_size
    )
    select * from pool
    order by random()
    limit p_limit;
    return;
  end if;

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

-- Rebuild title_similarity immediately with weighted scores rather than
-- waiting for tonight's cron (see for-you-recompute edge function).
select recompute_title_similarity();

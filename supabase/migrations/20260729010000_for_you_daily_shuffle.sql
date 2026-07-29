-- For You freshness fix: get_for_you() previously ranked candidates purely
-- by relevance and returned the same top-N every call, so a user who hasn't
-- added new signals saw an identical rail for days. Each tier now pulls a
-- wider pool by relevance, then shuffles it with a seed derived from the
-- user + the current date — same order all day (so a page refresh doesn't
-- reshuffle mid-session), a different order the next day, with no new
-- tables or write-on-view tracking needed.
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

  -- Deterministic per user per day: stable while browsing today, different
  -- tomorrow. hashtext() gives an int4 in the full 32-bit range; normalizing
  -- by 2147483647 lands it in the [-1, 1] setseed() expects.
  v_seed := (hashtext(v_user_id::text || to_char(current_date, 'YYYYMMDD')) % 2147483647)::double precision / 2147483647.0;
  perform setseed(v_seed);

  -- Tier 1: cross-user collaborative filtering. Sparse until enough PLOT
  -- users overlap on the same titles — keyed on whether it actually
  -- returned rows, not on how many signals the user has (see
  -- 20260726020000 for why signal-count was the wrong gate).
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
             sum(s.score) as relevance, 'similar_to_your_titles' as reason
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

  -- Tier 2: TMDB content-based similarity. Works from a user's very first
  -- signal — no PLOT-scale data needed.
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
             sum(cs.score) as relevance, 'similar_to_your_titles' as reason
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

  -- Tier 3: genre overlap. Last resort — only reached when the user's
  -- liked titles have no cross-user or TMDB-content coverage at all yet
  -- (e.g. the very next signal after signup, before the nightly job runs).
  return query
  with liked_genres as (
    select array_agg(distinct g) as genres
    from user_title_signals, unnest(genre_ids) as g
    where user_id = v_user_id
  ),
  pool as (
    select uts.tmdb_id, uts.media_type,
           (select count(*) from unnest(uts.genre_ids) g where g = any(lg.genres))::numeric as relevance,
           'because_you_like_these_genres' as reason
    from user_title_signals uts, liked_genres lg
    where lg.genres is not null
      and uts.genre_ids && lg.genres
      and not exists (
        select 1 from user_title_signals seen
        where seen.user_id = v_user_id
          and seen.tmdb_id = uts.tmdb_id and seen.media_type = uts.media_type
      )
    group by uts.tmdb_id, uts.media_type, uts.genre_ids, lg.genres
    order by relevance desc
    limit v_pool_size
  )
  select * from pool
  order by random()
  limit p_limit;
end;
$$;

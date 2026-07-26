-- "For You" tier 2: content-based similarity from TMDB's own recommendation
-- engine, complementing the cross-user collaborative filtering added in
-- 20260726020000. Cross-user similarity only has coverage once enough PLOT
-- users overlap on the same titles — early on (and for any niche title) it's
-- empty, which otherwise drops every user straight to the coarse genre-only
-- fallback. TMDB's /recommendations endpoint is itself a large-scale
-- collaborative + content model computed across all of TMDB's users, so it
-- gives every PLOT user (even their first session) a real, relevant middle
-- tier — still $0/mo, since it's the same TMDB API PLOT already proxies for
-- free.
--
-- Populated by the for-you-recompute edge function (needs an outbound HTTP
-- call per title, which plain SQL can't do), not by a SQL recompute function
-- like title_similarity. Coverage is cached per title and reused by every
-- user who has signalled on it, so the TMDB call happens once per title ever
-- seen, not once per user.
create table if not exists content_similarity (
  tmdb_id_a    integer not null,
  media_type_a text not null check (media_type_a in ('movie', 'tv')),
  tmdb_id_b    integer not null,
  media_type_b text not null check (media_type_b in ('movie', 'tv')),
  score        numeric not null,
  computed_at  timestamptz not null default now(),
  primary key (tmdb_id_a, media_type_a, tmdb_id_b, media_type_b)
);

create index if not exists content_similarity_lookup
  on content_similarity (tmdb_id_a, media_type_a, score desc);

alter table content_similarity enable row level security;
create policy "content_similarity is server-only"
  on content_similarity for select
  using (false);

grant select, insert, delete on content_similarity to service_role;

-- Titles the edge function should fetch TMDB recommendations for next: any
-- title with a real user signal that content_similarity hasn't cached yet.
-- p_limit bounds each nightly run's TMDB call volume; a title only needs
-- fetching once, so coverage converges over a few nights and steady-state
-- runs do near-zero work.
create or replace function for_you_content_similarity_gaps(p_limit integer default 50)
returns table (tmdb_id integer, media_type text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct uts.tmdb_id, uts.media_type
  from user_title_signals uts
  where not exists (
    select 1 from content_similarity cs
    where cs.tmdb_id_a = uts.tmdb_id and cs.media_type_a = uts.media_type
  )
  limit p_limit;
$$;

grant execute on function for_you_content_similarity_gaps(integer) to service_role;

-- Rewrite get_for_you() with a third tier between cross-user similarity and
-- the genre fallback: TMDB content-based similarity for the user's titles.
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
begin
  if v_user_id is null then
    return;
  end if;

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
    select s.tmdb_id_b, s.media_type_b, sum(s.score) as relevance, 'similar_to_your_titles' as reason
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
    select cs.tmdb_id_b, cs.media_type_b, sum(cs.score) as relevance, 'similar_to_your_titles' as reason
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
  )
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
  limit p_limit;
end;
$$;

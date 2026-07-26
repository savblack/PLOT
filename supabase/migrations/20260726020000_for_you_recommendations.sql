-- "For You" recommendations: item-item collaborative filtering over signals
-- already in the product (watchlist adds, favourites, and history ratings
-- >= 7/10). No external ML service, no vector DB — computed and served
-- entirely in Postgres.

-- 1. Signal view: every (user, title) pair that represents "this user liked
--    this title", pulled from the three tables that already carry the data.
--    user_favourites has no genre_ids column, so it's backfilled as empty.
create materialized view if not exists user_title_signals as
select user_id, tmdb_id, media_type, coalesce(genre_ids, '{}'::integer[]) as genre_ids
from list_items
union
select user_id, tmdb_id, media_type, '{}'::integer[] as genre_ids
from user_favourites
union
select user_id, tmdb_id, media_type, coalesce(genre_ids, '{}'::integer[]) as genre_ids
from history
where rating >= 7 and (dnf is null or dnf = false);

create unique index if not exists user_title_signals_uniq
  on user_title_signals (user_id, tmdb_id, media_type);

-- 2. Similarity table: co-occurrence across all users, cosine-normalized by
--    each title's overall popularity so blockbusters don't dominate every
--    recommendation. Rebuilt nightly by recompute_title_similarity().
create table if not exists title_similarity (
  tmdb_id_a    integer not null,
  media_type_a text not null check (media_type_a in ('movie', 'tv')),
  tmdb_id_b    integer not null,
  media_type_b text not null check (media_type_b in ('movie', 'tv')),
  score        numeric not null,
  updated_at   timestamptz not null default now(),
  primary key (tmdb_id_a, media_type_a, tmdb_id_b, media_type_b)
);

create index if not exists title_similarity_lookup
  on title_similarity (tmdb_id_a, media_type_a, score desc);

alter table title_similarity enable row level security;
create policy "title_similarity is server-only"
  on title_similarity for select
  using (false);

-- 3. Nightly recompute, called from the for-you-recompute edge function via
--    supabase.rpc(). security definer so the cron job's service-role call
--    can refresh the view and rewrite the table without broader grants.
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
      count(*) as co_count
    from user_title_signals a
    join user_title_signals b
      on a.user_id = b.user_id
     and (a.tmdb_id, a.media_type) < (b.tmdb_id, b.media_type)
    group by 1, 2, 3, 4
  ),
  popularity as (
    select tmdb_id, media_type, count(*) as n
    from user_title_signals
    group by 1, 2
  )
  select
    p.tmdb_id_a, p.media_type_a, p.tmdb_id_b, p.media_type_b,
    p.co_count / sqrt(pa.n::numeric * pb.n::numeric) as score
  from pairs p
  join popularity pa on pa.tmdb_id = p.tmdb_id_a and pa.media_type = p.media_type_a
  join popularity pb on pb.tmdb_id = p.tmdb_id_b and pb.media_type = p.media_type_b
  where p.co_count >= 2;
end;
$$;

-- 4. Serving function: callable directly from the app via supabase-js
--    .rpc('get_for_you', { p_limit: 20 }) — no edge function needed to read.
--    Ranks candidates from titles similar to what the caller already liked,
--    excludes anything they've already signalled on, and falls back to
--    genre overlap for users too new to have similarity rows yet.
create or replace function get_for_you(p_limit integer default 20)
returns table (tmdb_id integer, media_type text, relevance numeric, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_signal_count integer;
begin
  if v_user_id is null then
    return;
  end if;

  select count(*) into v_signal_count
  from user_title_signals
  where user_id = v_user_id;

  if v_signal_count >= 3 then
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
  else
    -- Cold start: rank by genre overlap with whatever the user has liked so
    -- far, restricted to titles other users have actually signalled on
    -- (keeps results to real, checkable titles rather than an open catalog).
    return query
    with liked_genres as (
      select array_agg(distinct g) as genres
      from user_title_signals, unnest(genre_ids) as g
      where user_id = v_user_id
    )
    select uts.tmdb_id, uts.media_type,
           cardinality(uts.genre_ids & lg.genres)::numeric as relevance,
           'because_you_like_these_genres' as reason
    from user_title_signals uts, liked_genres lg
    where lg.genres is not null
      and uts.genre_ids && lg.genres
      and not exists (
        select 1 from user_title_signals seen
        where seen.user_id = v_user_id
          and seen.tmdb_id = uts.tmdb_id and seen.media_type = uts.media_type
      )
    group by uts.tmdb_id, uts.media_type, uts.genre_ids
    order by relevance desc
    limit p_limit;
  end if;
end;
$$;

grant execute on function get_for_you(integer) to authenticated;

-- The nightly recompute is called from the for-you-recompute edge function
-- via the service role. Needs explicit grants (unlike client-facing RPCs,
-- which ride PostgREST's default grants to authenticated/anon).
grant usage on schema public to service_role;
grant execute on function recompute_title_similarity() to service_role;

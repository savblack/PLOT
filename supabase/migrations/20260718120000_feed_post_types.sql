-- Feed post types: favourites and Top 10, not just watches.
--
-- A watch was the only thing that produced a feed post. This adds two more
-- signals — favouriting a title, and adding one to your Top 10 — so an active
-- user generates more feed content (denser feeds for a thin network). Each still
-- renders as the poster-as-photo card; only the caption differs.

-- ── 1. feed_posts: allow multiple post types per title + a Top 10 rank ───────
-- Drop the old unique (author_id, tmdb_id, media_type) — a title can now be both
-- a watch AND a favourite post. Done by column set so we don't depend on the
-- auto-generated constraint name.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.feed_posts'::regclass and contype = 'u'
  loop execute format('alter table public.feed_posts drop constraint %I', r.conname); end loop;
  for r in select conname from pg_constraint
           where conrelid = 'public.feed_posts'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%source_type%'
  loop execute format('alter table public.feed_posts drop constraint %I', r.conname); end loop;
end $$;

alter table public.feed_posts add constraint feed_posts_author_type_title_key
  unique (author_id, source_type, tmdb_id, media_type);
alter table public.feed_posts add constraint feed_posts_source_type_check
  check (source_type in ('watch', 'favourite', 'top_list'));
alter table public.feed_posts add column if not exists rank int;

-- ── 2. Update the watch trigger's conflict target to the new key ─────────────
create or replace function public.feed_post_from_journal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.feed_posts
      where author_id = old.user_id and source_type = 'watch'
        and tmdb_id = old.tmdb_id and media_type = old.media_type;
    return old;
  end if;

  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, rating, note)
    values (new.user_id, 'watch', new.tmdb_id, new.media_type, new.title, new.poster_path, new.rating, new.note)
  on conflict (author_id, source_type, tmdb_id, media_type) do update
    set title = excluded.title, poster_path = excluded.poster_path,
        rating = excluded.rating, note = excluded.note, updated_at = now();
  return new;
end;
$$;

-- ── 3. Favourite → post ─────────────────────────────────────────────────────
create or replace function public.feed_post_from_favourite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.feed_posts
      where author_id = old.user_id and source_type = 'favourite'
        and tmdb_id = old.tmdb_id and media_type = old.media_type;
    return old;
  end if;
  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path)
    values (new.user_id, 'favourite', new.tmdb_id, new.media_type, new.title, new.poster_path)
  on conflict (author_id, source_type, tmdb_id, media_type) do update
    set title = excluded.title, poster_path = excluded.poster_path, updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_feed_post_from_favourite on public.user_favourites;
create trigger trg_feed_post_from_favourite after insert or update or delete on public.user_favourites
  for each row execute function public.feed_post_from_favourite();

-- ── 4. Top 10 entry → post (rank tracked; re-ranking updates in place) ───────
create or replace function public.feed_post_from_top_list()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.feed_posts
      where author_id = old.user_id and source_type = 'top_list'
        and tmdb_id = old.tmdb_id and media_type = old.media_type;
    return old;
  end if;
  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, rank)
    values (new.user_id, 'top_list', new.tmdb_id, new.media_type, new.title, new.poster_path, new.rank)
  on conflict (author_id, source_type, tmdb_id, media_type) do update
    set title = excluded.title, poster_path = excluded.poster_path,
        rank = excluded.rank, updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_feed_post_from_top_list on public.user_top_lists;
create trigger trg_feed_post_from_top_list after insert or update or delete on public.user_top_lists
  for each row execute function public.feed_post_from_top_list();

-- ── 5. Backfill existing favourites + Top 10 entries ────────────────────────
insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, created_at)
  select user_id, 'favourite', tmdb_id, media_type, title, poster_path, coalesce(created_at, now())
  from public.user_favourites
on conflict (author_id, source_type, tmdb_id, media_type) do nothing;

insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, rank)
  select user_id, 'top_list', tmdb_id, media_type, title, poster_path, rank
  from public.user_top_lists
on conflict (author_id, source_type, tmdb_id, media_type) do nothing;

-- ── 6. Feed RPCs return source_type + rank so the UI can label each card ─────
drop function if exists public.get_feed(timestamptz, int);
create or replace function public.get_feed(p_cursor timestamptz default null, p_limit int default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  author_avatar_url text, author_is_premium boolean,
  source_type text, rank int,
  tmdb_id integer, media_type text, title text, poster_path text,
  rating numeric, note text, created_at timestamptz,
  like_count bigint, comment_count bigint, viewer_liked boolean
)
language sql security definer stable set search_path = public as $$
  select fp.id, fp.author_id, p.username, p.display_name, p.avatar_url, p.is_premium,
         fp.source_type, fp.rank,
         fp.tmdb_id, fp.media_type, fp.title, fp.poster_path, fp.rating, fp.note, fp.created_at,
         (select count(*) from public.post_likes pl where pl.post_id = fp.id),
         (select count(*) from public.post_comments pc where pc.post_id = fp.id),
         exists (select 1 from public.post_likes pl2 where pl2.post_id = fp.id and pl2.user_id = auth.uid())
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  where (
      fp.author_id = auth.uid()
      or fp.author_id in (select following_id from public.follows where follower_id = auth.uid() and status = 'accepted')
    )
    and (p_cursor is null or fp.created_at < p_cursor)
  order by fp.created_at desc
  limit least(coalesce(p_limit, 20), 50)
$$;
grant execute on function public.get_feed(timestamptz, int) to authenticated;

drop function if exists public.get_global_feed(timestamptz, int);
create or replace function public.get_global_feed(p_cursor timestamptz default null, p_limit int default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  author_avatar_url text, author_is_premium boolean,
  source_type text, rank int,
  tmdb_id integer, media_type text, title text, poster_path text,
  rating numeric, note text, created_at timestamptz,
  like_count bigint, comment_count bigint, viewer_liked boolean
)
language sql security definer stable set search_path = public as $$
  select fp.id, fp.author_id, p.username, p.display_name, p.avatar_url, p.is_premium,
         fp.source_type, fp.rank,
         fp.tmdb_id, fp.media_type, fp.title, fp.poster_path, fp.rating, fp.note, fp.created_at,
         (select count(*) from public.post_likes pl where pl.post_id = fp.id),
         (select count(*) from public.post_comments pc where pc.post_id = fp.id),
         exists (select 1 from public.post_likes pl2 where pl2.post_id = fp.id and pl2.user_id = auth.uid())
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  where public.is_profile_public(fp.author_id)
    and (p_cursor is null or fp.created_at < p_cursor)
  order by fp.created_at desc
  limit least(coalesce(p_limit, 20), 50)
$$;
grant execute on function public.get_global_feed(timestamptz, int) to anon, authenticated;

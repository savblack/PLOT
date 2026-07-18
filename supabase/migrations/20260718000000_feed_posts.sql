-- Activity feed: auto-posts + a following feed.
--
-- The pivot toward a social, feed-first product. A "post" is not composed by hand —
-- logging a watch (a `journal` row) auto-becomes a feed post: the poster is the image,
-- the star rating + written review are the caption. This migration:
--   1. Adds `feed_posts`, a materialised post per (author, title), kept in sync by a
--      trigger on `journal` (insert/update/delete). One clean row per watch, so likes
--      and comments (next migration) have a single stable target, and the feed is a
--      simple keyset-paginated select.
--   2. RLS mirrors journal visibility exactly (reuses is_profile_public /
--      is_accepted_follower) — a private author's posts reach only accepted followers.
--   3. get_feed() — the following feed (self + accepted follows).
--   4. get_global_feed() — recent public posts, the cold-start fallback so the feed is
--      never empty while the network is still thin.

-- ── 1. feed_posts ───────────────────────────────────────────────────────────
-- Natural key is (author_id, tmdb_id, media_type): journal upserts on
-- (user_id, tmdb_id), so there is exactly one journal row — and thus one post —
-- per title per user. Keying on that (rather than journal.id) keeps this
-- independent of the journal PK's type.
create table if not exists public.feed_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users (id) on delete cascade,
  source_type text not null default 'watch' check (source_type in ('watch')),
  tmdb_id     integer,
  media_type  text,
  title       text,
  poster_path text,
  rating      numeric,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (author_id, tmdb_id, media_type)
);
create index if not exists feed_posts_author_created_idx on public.feed_posts (author_id, created_at desc);
create index if not exists feed_posts_created_idx on public.feed_posts (created_at desc);

alter table public.feed_posts enable row level security;

-- Read mirrors content visibility: own posts, public profiles, or accepted
-- followers. No insert/update/delete policy → clients can't forge posts; the
-- SECURITY DEFINER trigger below is the only writer.
drop policy if exists "feed posts visible by profile visibility" on public.feed_posts;
create policy "feed posts visible by profile visibility" on public.feed_posts
  for select to anon, authenticated using (
    auth.uid() = author_id
    or public.is_profile_public(author_id)
    or public.is_accepted_follower(author_id)
  );

-- ── 2. Keep feed_posts in sync with journal ─────────────────────────────────
-- A watch = a post. Editing a review upserts the same post in place (no feed
-- spam); deleting the watch deletes the post. created_at is set once, so an edit
-- updates content without re-surfacing the post to the top of the feed.
create or replace function public.feed_post_from_journal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.feed_posts
      where author_id = old.user_id and tmdb_id = old.tmdb_id and media_type = old.media_type;
    return old;
  end if;

  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, rating, note)
    values (new.user_id, 'watch', new.tmdb_id, new.media_type, new.title, new.poster_path, new.rating, new.note)
  on conflict (author_id, tmdb_id, media_type) do update
    set title       = excluded.title,
        poster_path = excluded.poster_path,
        rating      = excluded.rating,
        note        = excluded.note,
        updated_at  = now();
  return new;
end;
$$;

drop trigger if exists trg_feed_post_from_journal on public.journal;
create trigger trg_feed_post_from_journal after insert or update or delete on public.journal
  for each row execute function public.feed_post_from_journal();

-- Backfill existing watch history into the feed. Order by watched_at (best
-- available signal for when it happened); on-conflict-nothing is idempotent.
insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title, poster_path, rating, note, created_at)
  select user_id, 'watch', tmdb_id, media_type, title, poster_path, rating, note,
         coalesce(watched_at::timestamptz, now())
  from public.journal
on conflict (author_id, tmdb_id, media_type) do nothing;

-- ── 3. Following feed ───────────────────────────────────────────────────────
-- Posts from the viewer + everyone they've accepted-followed, newest first.
-- SECURITY DEFINER so it can join the author's profile (clients can't read
-- profiles directly). Keyset pagination via the created_at cursor.
create or replace function public.get_feed(p_cursor timestamptz default null, p_limit int default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  author_avatar_url text, author_is_premium boolean,
  tmdb_id integer, media_type text, title text, poster_path text,
  rating numeric, note text, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select fp.id, fp.author_id, p.username, p.display_name, p.avatar_url, p.is_premium,
         fp.tmdb_id, fp.media_type, fp.title, fp.poster_path, fp.rating, fp.note, fp.created_at
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  where (
      fp.author_id = auth.uid()
      or fp.author_id in (
        select following_id from public.follows
        where follower_id = auth.uid() and status = 'accepted'
      )
    )
    and (p_cursor is null or fp.created_at < p_cursor)
  order by fp.created_at desc
  limit least(coalesce(p_limit, 20), 50)
$$;
grant execute on function public.get_feed(timestamptz, int) to authenticated;

-- ── 4. Global (popular) feed — cold-start fallback ──────────────────────────
-- Recent posts from public profiles, so a viewer with a sparse follow graph
-- still lands on content (doubles as discovery). Available to anon too.
create or replace function public.get_global_feed(p_cursor timestamptz default null, p_limit int default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  author_avatar_url text, author_is_premium boolean,
  tmdb_id integer, media_type text, title text, poster_path text,
  rating numeric, note text, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select fp.id, fp.author_id, p.username, p.display_name, p.avatar_url, p.is_premium,
         fp.tmdb_id, fp.media_type, fp.title, fp.poster_path, fp.rating, fp.note, fp.created_at
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  where public.is_profile_public(fp.author_id)
    and (p_cursor is null or fp.created_at < p_cursor)
  order by fp.created_at desc
  limit least(coalesce(p_limit, 20), 50)
$$;
grant execute on function public.get_global_feed(timestamptz, int) to anon, authenticated;

-- Feed engagement: likes + comments on feed posts, plus notifications.
--
-- Phase 2 of the social pivot. Both objects hang off feed_posts.id, so likes and
-- comments have one stable target. Visibility is derived from the parent post:
-- you can like/comment/read only where you can see the post (own / public author
-- / accepted follower) — the same rule feed_posts RLS already enforces. Writes
-- are always as yourself. Notifications reuse the existing forge-proof pattern
-- (SECURITY DEFINER trigger is the only writer; self-actions don't notify).

-- ── 1. Likes ────────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id    uuid not null references public.feed_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id);

alter table public.post_likes enable row level security;

-- Helper predicate (inlined per policy): the parent post is visible to the viewer.
drop policy if exists "post likes readable with post" on public.post_likes;
create policy "post likes readable with post" on public.post_likes
  for select to authenticated using (
    exists (select 1 from public.feed_posts fp where fp.id = post_id and (
      auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  );
drop policy if exists "users insert own likes" on public.post_likes;
create policy "users insert own likes" on public.post_likes
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.feed_posts fp where fp.id = post_id and (
      auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  );
drop policy if exists "users delete own likes" on public.post_likes;
create policy "users delete own likes" on public.post_likes
  for delete to authenticated using (auth.uid() = user_id);

-- ── 2. Comments ─────────────────────────────────────────────────────────────
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.feed_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_created_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

drop policy if exists "post comments readable with post" on public.post_comments;
create policy "post comments readable with post" on public.post_comments
  for select to authenticated using (
    exists (select 1 from public.feed_posts fp where fp.id = post_id and (
      auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  );
drop policy if exists "users insert own comments" on public.post_comments;
create policy "users insert own comments" on public.post_comments
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.feed_posts fp where fp.id = post_id and (
      auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  );
drop policy if exists "users delete own comments" on public.post_comments;
create policy "users delete own comments" on public.post_comments
  for delete to authenticated using (auth.uid() = user_id);

-- ── 3. Notifications: like / comment types + post reference ─────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower', 'post_like', 'post_comment'));
alter table public.notifications add column if not exists post_id uuid references public.feed_posts (id) on delete cascade;

create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from public.feed_posts where id = new.post_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, post_id)
      values (v_author, 'post_like', new.user_id, new.post_id);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notify_post_like on public.post_likes;
create trigger trg_notify_post_like after insert on public.post_likes
  for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from public.feed_posts where id = new.post_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, post_id)
      values (v_author, 'post_comment', new.user_id, new.post_id);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notify_post_comment on public.post_comments;
create trigger trg_notify_post_comment after insert on public.post_comments
  for each row execute function public.notify_post_comment();

-- Enriched notifications now carry post context (title/poster) for like/comment.
-- Adding columns changes the return type, so drop before recreate.
drop function if exists public.list_notifications();
create or replace function public.list_notifications()
returns table (id uuid, type text, actor_id uuid, actor_username text,
               actor_display_name text, actor_avatar_url text,
               post_id uuid, post_title text, post_poster_path text,
               created_at timestamptz, read_at timestamptz)
language sql security definer stable set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at
  from public.notifications n
  join public.profiles p on p.id = n.actor_id
  left join public.feed_posts fp on fp.id = n.post_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit 50
$$;
grant execute on function public.list_notifications() to authenticated;

-- ── 4. Feed RPCs now return engagement counts + viewer_liked ────────────────
-- Adding columns changes the return type → drop before recreate.
drop function if exists public.get_feed(timestamptz, int);
create or replace function public.get_feed(p_cursor timestamptz default null, p_limit int default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  author_avatar_url text, author_is_premium boolean,
  tmdb_id integer, media_type text, title text, poster_path text,
  rating numeric, note text, created_at timestamptz,
  like_count bigint, comment_count bigint, viewer_liked boolean
)
language sql security definer stable set search_path = public as $$
  select fp.id, fp.author_id, p.username, p.display_name, p.avatar_url, p.is_premium,
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
  tmdb_id integer, media_type text, title text, poster_path text,
  rating numeric, note text, created_at timestamptz,
  like_count bigint, comment_count bigint, viewer_liked boolean
)
language sql security definer stable set search_path = public as $$
  select fp.id, fp.author_id, p.username, p.display_name, p.avatar_url, p.is_premium,
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

-- ── 5. Comments for a post (joins author profile clients can't read) ────────
create or replace function public.list_post_comments(p_post_id uuid)
returns table (id uuid, user_id uuid, username text, display_name text,
               avatar_url text, body text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select c.id, c.user_id, p.username, p.display_name, p.avatar_url, c.body, c.created_at
  from public.post_comments c
  join public.profiles p on p.id = c.user_id
  where c.post_id = p_post_id
    and exists (select 1 from public.feed_posts fp where fp.id = p_post_id and (
      auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  order by c.created_at asc
  limit 200
$$;
grant execute on function public.list_post_comments(uuid) to authenticated;

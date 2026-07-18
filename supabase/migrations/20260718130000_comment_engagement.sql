-- Comment engagement: likes on comments + editing.
--
-- Extends the feed's comments so people can like individual comments and edit
-- their own. Deleting own comments already works (Phase 2 RLS).

-- ── 1. Editing: track edits + allow authors to update their own comment ─────
alter table public.post_comments add column if not exists edited_at timestamptz;

drop policy if exists "users update own comments" on public.post_comments;
create policy "users update own comments" on public.post_comments
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 2. Comment likes ────────────────────────────────────────────────────────
create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

-- Readable / likeable when the parent comment's post is visible to the viewer.
drop policy if exists "comment likes readable" on public.comment_likes;
create policy "comment likes readable" on public.comment_likes
  for select to authenticated using (
    exists (select 1 from public.post_comments c join public.feed_posts fp on fp.id = c.post_id
      where c.id = comment_id and (
        auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  );
drop policy if exists "users insert own comment likes" on public.comment_likes;
create policy "users insert own comment likes" on public.comment_likes
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.post_comments c join public.feed_posts fp on fp.id = c.post_id
      where c.id = comment_id and (
        auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  );
drop policy if exists "users delete own comment likes" on public.comment_likes;
create policy "users delete own comment likes" on public.comment_likes
  for delete to authenticated using (auth.uid() = user_id);

-- ── 3. list_post_comments now carries like_count, viewer_liked, edited_at ────
drop function if exists public.list_post_comments(uuid);
create or replace function public.list_post_comments(p_post_id uuid)
returns table (id uuid, user_id uuid, username text, display_name text, avatar_url text,
               body text, created_at timestamptz, edited_at timestamptz,
               like_count bigint, viewer_liked boolean)
language sql security definer stable set search_path = public as $$
  select c.id, c.user_id, p.username, p.display_name, p.avatar_url, c.body, c.created_at, c.edited_at,
         (select count(*) from public.comment_likes cl where cl.comment_id = c.id),
         exists (select 1 from public.comment_likes cl2 where cl2.comment_id = c.id and cl2.user_id = auth.uid())
  from public.post_comments c
  join public.profiles p on p.id = c.user_id
  where c.post_id = p_post_id
    and exists (select 1 from public.feed_posts fp where fp.id = p_post_id and (
      auth.uid() = fp.author_id or public.is_profile_public(fp.author_id) or public.is_accepted_follower(fp.author_id)))
  order by c.created_at asc
  limit 200
$$;
grant execute on function public.list_post_comments(uuid) to authenticated;

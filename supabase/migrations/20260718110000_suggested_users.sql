-- Suggested users: the cold-start engine for the feed.
--
-- With a thin follow graph, the feed leans on discovery. This returns public
-- profiles the viewer isn't already connected to, ranked by how active they are
-- (feed_posts count) so the most followable people surface first. Shape matches
-- search_users so the same UserList / FollowButton UI renders it.
create or replace function public.suggested_users(p_limit int default 20)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_public boolean, follow_status text,
               post_count bigint)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium, p.is_public,
         null::text as follow_status,
         count(fp.id) as post_count
  from public.profiles p
  left join public.feed_posts fp on fp.author_id = p.id
  where p.is_public
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = p.id
    )
  group by p.id, p.username, p.display_name, p.avatar_url, p.is_premium, p.is_public
  order by count(fp.id) desc, p.username asc
  limit least(coalesce(p_limit, 20), 50)
$$;
grant execute on function public.suggested_users(int) to authenticated;

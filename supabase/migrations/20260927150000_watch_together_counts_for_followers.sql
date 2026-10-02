-- Watch together: show "in common" counts for private profiles you follow.
--
-- Since 20260926090000 an accepted follower of a private profile can read its
-- watchlist (list_items is readable through can_view_profile), and
-- 20260927140000 made Watch together's full-watchlist rule agree. The overlap
-- count still used is_profile_public, so the start page and profile tile said
-- "Shows once they accept" for private profiles you follow, even though you
-- could already see everything the count is made from. A count reveals no
-- more than that, and never the titles themselves.
--
-- Both functions are recreated from their only bodies; the one change in each
-- is is_profile_public -> can_view_profile for the count. Return types are
-- unchanged, so grants carry over.
--   suggest_watch_together: body from 20260927130000.
--   watch_together_status:  body from 20260927100000.

create or replace function public.suggest_watch_together()
returns table (id uuid, username text, display_name text, avatar_url text, overlap_count int)
language sql stable security definer set search_path = public as $$
  with links as (
    select case when f.follower_id = auth.uid() then f.following_id else f.follower_id end as uid,
           count(*) as directions
      from public.follows f
     where f.status = 'accepted' and auth.uid() in (f.follower_id, f.following_id)
     group by 1
  ),
  people as (
    select p.id, p.username, p.display_name, p.avatar_url, links.directions,
           case when public.can_view_profile(links.uid)
                then public.watch_together_overlap_count(links.uid) end as overlap_count
      from links
      join public.profiles p on p.id = links.uid
     where public.not_blocked(links.uid)
       and p.watch_together_requests_from <> 'none'
       and (p.watch_together_requests_from <> 'following' or exists (
         select 1 from public.follows f2
          where f2.follower_id = links.uid and f2.following_id = auth.uid() and f2.status = 'accepted'))
       and (public.is_profile_public(links.uid) or public.is_accepted_follower(links.uid))
       and not exists (
         select 1 from public.watch_together w
          where ((w.requester_id = auth.uid() and w.recipient_id = links.uid)
              or (w.requester_id = links.uid and w.recipient_id = auth.uid()))
            and (w.status = 'accepted' or w.created_at > now() - interval '90 days'))
       and not exists (
         select 1 from public.watch_together_closed c
          where ((c.requester_id = auth.uid() and c.recipient_id = links.uid)
              or (c.requester_id = links.uid and c.recipient_id = auth.uid()))
            and c.closed_at > now() - interval '60 days')
  )
  select id, username, display_name, avatar_url, overlap_count
    from people
   order by directions desc, coalesce(overlap_count, 0) desc, username
   limit 5
$$;

-- What a friend's profile tile needs. state: 'none', 'outgoing', 'incoming'
-- or 'paired'. overlap_count is returned once you are partners, or when you
-- can already see their watchlist (public, or you follow them).
create or replace function public.watch_together_status(p_other uuid)
returns table (state text, overlap_count int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_row public.watch_together;
  v_state text := 'none';
begin
  if auth.uid() is null or p_other = auth.uid() or not public.not_blocked(p_other) then
    return;
  end if;
  v_row := public.watch_together_row(p_other);
  if v_row.requester_id is not null then
    v_state := case when v_row.status = 'accepted' then 'paired'
                    when v_row.recipient_id = auth.uid() then 'incoming'
                    else 'outgoing' end;
  end if;
  return query select v_state,
    case when v_state = 'paired' or public.can_view_profile(p_other)
         then public.watch_together_overlap_count(p_other) end;
end;
$$;

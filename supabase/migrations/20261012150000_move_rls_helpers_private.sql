-- Move RLS helper functions out of the exposed API schema.
--
-- PostgREST publishes every public function anon or authenticated can
-- execute. These six are security definer because profiles, follows, and
-- user_blocks are not readable under RLS, and policies call them while a
-- request is in flight. Nothing in the app calls them as RPCs. Leaving
-- them in public meant anyone with the anon key could ask
-- not_blocked(user) or is_profile_public(user) directly.
--
-- The functions move to private. Their OIDs stay the same, so policies
-- that already point at them keep working. Function bodies name them as
-- public.helper, which is resolved when the function runs, so those
-- bodies are rewritten in the same transaction.
--
-- anon, authenticated, and service_role keep EXECUTE. They also need
-- USAGE on private, or the policy check fails when it looks the
-- function up. The Data API schema list does not include private, so
-- the helpers are no longer RPCs.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

do $move$
begin
  if to_regprocedure('public.not_blocked(uuid)') is not null then
    alter function public.not_blocked(uuid) set schema private;
  end if;
  if to_regprocedure('public.is_profile_public(uuid)') is not null then
    alter function public.is_profile_public(uuid) set schema private;
  end if;
  if to_regprocedure('public.is_accepted_follower(uuid)') is not null then
    alter function public.is_accepted_follower(uuid) set schema private;
  end if;
  if to_regprocedure('public.is_custom_list_member(uuid)') is not null then
    alter function public.is_custom_list_member(uuid) set schema private;
  end if;
  if to_regprocedure('public.can_edit_shared_list(uuid)') is not null then
    alter function public.can_edit_shared_list(uuid) set schema private;
  end if;
  if to_regprocedure('public.can_view_watchlist(uuid)') is not null then
    alter function public.can_view_watchlist(uuid) set schema private;
  end if;
end
$move$;

-- Helpers that call each other, rewritten onto private.

CREATE OR REPLACE FUNCTION private.can_edit_shared_list(p_list uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_custom_lists where id = p_list and user_id = auth.uid())
      or private.is_custom_list_member(p_list)
$function$
;

CREATE OR REPLACE FUNCTION private.can_view_watchlist(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(p_owner = auth.uid(), false)
      or (private.not_blocked(p_owner) and case public.watchlist_visibility_of(p_owner)
            when 'everyone'  then true
            when 'followers' then private.is_accepted_follower(p_owner) or public.is_selected_watchlist_viewer(p_owner)
            when 'selected'  then public.is_selected_watchlist_viewer(p_owner)
            else false
          end)
$function$
;

CREATE OR REPLACE FUNCTION private.is_custom_list_member(p_list uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_custom_list_members m
      join public.user_custom_lists l on l.id = m.list_id
     where m.list_id = p_list and m.user_id = auth.uid()
       and private.not_blocked(l.user_id)
  )
$function$
;

-- Callers. Bodies only; the functions stay in public.

CREATE OR REPLACE FUNCTION public.accept_list_invite(p_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_list uuid;
  v_owner uuid;
  v_by uuid;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  select l.id, l.user_id, k.created_by into v_list, v_owner, v_by
    from public.user_custom_list_invites k
    join public.user_custom_lists l on l.id = k.list_id
   where k.invite_key = p_key;
  if v_list is null or not private.not_blocked(v_owner) then raise exception 'not_allowed'; end if;
  if v_owner = auth.uid() then return v_list; end if;
  if exists (select 1 from public.user_custom_list_members where list_id = v_list and user_id = auth.uid()) then
    return v_list;
  end if;
  if not public.is_premium(v_owner) then raise exception 'premium_required'; end if;
  insert into public.user_custom_list_members (list_id, user_id, added_by)
    values (v_list, auth.uid(), coalesce(v_by, v_owner))
    on conflict do nothing;
  return v_list;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_watch_together_link(p_key text, p_share_full boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_row public.watch_together;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  select k.user_id into v_owner from public.watch_together_links k where k.link_key = p_key;
  if v_owner is null or v_owner = auth.uid() or not private.not_blocked(v_owner) then
    raise exception 'not_allowed';
  end if;

  v_row := public.watch_together_row(v_owner);
  if v_row.requester_id is not null and v_row.status = 'accepted' then return 'accepted'; end if;

  delete from public.watch_together
   where status = 'pending'
     and ((requester_id = auth.uid() and recipient_id = v_owner)
       or (requester_id = v_owner and recipient_id = auth.uid()));
  insert into public.watch_together (requester_id, recipient_id, status, accepted_at)
    values (v_owner, auth.uid(), 'accepted', now());
  if coalesce(p_share_full, false) then perform public.share_watchlist_with(v_owner, true, true); end if;
  delete from public.watch_together_closed
   where (requester_id = auth.uid() and recipient_id = v_owner)
      or (requester_id = v_owner and recipient_id = auth.uid());
  delete from public.notifications
   where type = 'watch_together_request'
     and ((user_id = auth.uid() and actor_id = v_owner) or (user_id = v_owner and actor_id = auth.uid()));
  insert into public.notifications (user_id, type, actor_id)
    values (v_owner, 'watch_together_accepted', auth.uid());
  return 'accepted';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_shared_list_item(p_list uuid, p_tmdb_id integer, p_media_type text, p_title text, p_poster_path text DEFAULT NULL::text, p_genre_ids integer[] DEFAULT '{}'::integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  if not private.can_edit_shared_list(p_list) or p_media_type not in ('movie', 'tv') then
    raise exception 'not_allowed';
  end if;
  select user_id into v_owner from public.user_custom_lists where id = p_list;
  insert into public.user_custom_list_items (list_id, user_id, tmdb_id, media_type, title, poster_path, genre_ids, added_by)
    values (p_list, v_owner, p_tmdb_id, p_media_type, coalesce(p_title, ''), p_poster_path, coalesce(p_genre_ids, '{}'), auth.uid())
    on conflict (list_id, tmdb_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_shared_list_member(p_list uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  if not private.can_edit_shared_list(p_list) or not public.is_watch_together_partner(p_user)
     or not private.not_blocked(p_user) then
    raise exception 'not_allowed';
  end if;
  select user_id into v_owner from public.user_custom_lists where id = p_list;
  if not public.is_premium(v_owner) then raise exception 'premium_required'; end if;
  if p_user = v_owner or not exists (select 1 from public.profiles where id = p_user) then
    return false;
  end if;
  insert into public.user_custom_list_members (list_id, user_id, added_by)
    values (p_list, p_user, auth.uid())
    on conflict do nothing;
  if not found then return false; end if;
  insert into public.notifications (user_id, type, actor_id) values (p_user, 'watch_together_list', auth.uid());
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_full_watchlist(p_other uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.can_view_watchlist(p_other)
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_custom_list(p_owner uuid, p_visibility text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case p_visibility
    when 'public'    then public.can_view_profile(p_owner)
    when 'followers' then (coalesce(p_owner = auth.uid(), false)
                           or private.is_accepted_follower(p_owner))
                          and private.not_blocked(p_owner)
    -- 'link' is deliberately false here: see get_shared_list below.
    else false
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select (coalesce(p_uid = auth.uid(), false)
          or private.is_profile_public(p_uid)
          or private.is_accepted_follower(p_uid))
     and private.not_blocked(p_uid);
$function$
;

CREATE OR REPLACE FUNCTION public.get_follow_counts(p_target uuid)
 RETURNS TABLE(followers bigint, following bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    (select count(*) from public.follows f
      where f.following_id = p_target and f.status = 'accepted') as followers,
    (select count(*) from public.follows f
      where f.follower_id = p_target and f.status = 'accepted') as following
  where private.not_blocked(p_target)
    and (
      auth.uid() = p_target
      or private.is_profile_public(p_target)
      or private.is_accepted_follower(p_target)
    )
$function$
;

CREATE OR REPLACE FUNCTION public.get_profile_card(p_username text)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_premium boolean, is_supporter boolean, is_public boolean, follow_status text, profile_sections text[], bio text, links jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid()),
         p.profile_sections, p.bio, p.links
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
    and private.not_blocked(p.id)                                    -- + block
$function$
;

CREATE OR REPLACE FUNCTION public.get_shared_list(p_list_id uuid)
 RETURNS TABLE(id uuid, name text, user_id uuid, visibility text, items jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select l.id, l.name, l.user_id, l.visibility,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'tmdb_id', i.tmdb_id, 'media_type', i.media_type,
                    'title', i.title, 'poster_path', i.poster_path)
                  order by i.added_at)
             from public.user_custom_list_items i
            where i.list_id = l.id
         ), '[]'::jsonb)
    from public.user_custom_lists l
   where l.id = p_list_id
     and (   (l.visibility = 'link' and private.not_blocked(l.user_id))
          or public.can_view_custom_list(l.user_id, l.visibility)
          or l.user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.is_selected_watchlist_viewer(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.watchlist_viewers v
                  where v.owner_id = p_owner and v.viewer_id = auth.uid())
     and (private.is_accepted_follower(p_owner) or public.is_watch_together_partner(p_owner))
$function$
;

CREATE OR REPLACE FUNCTION public.is_watch_together_partner(p_other uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.watch_together w
     where w.status = 'accepted'
       and ((w.requester_id = auth.uid() and w.recipient_id = p_other)
         or (w.requester_id = p_other and w.recipient_id = auth.uid()))
  ) and private.not_blocked(p_other)
$function$
;

CREATE OR REPLACE FUNCTION public.list_follow_requests()
 RETURNS TABLE(follower_id uuid, username text, display_name text, avatar_url text, requested_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.follower_id, p.username, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = auth.uid() and f.status = 'pending'
    and private.not_blocked(f.follower_id)                           -- + block
  order by f.created_at desc
$function$
;

CREATE OR REPLACE FUNCTION public.list_followers(p_target uuid)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_premium boolean, is_supporter boolean, is_public boolean, follow_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = p_target and f.status = 'accepted'
    and (private.is_profile_public(p_target) or private.is_accepted_follower(p_target) or auth.uid() = p_target)
    and private.not_blocked(p_target) and private.not_blocked(p.id)   -- + block
  order by f.created_at desc
  limit 200
$function$
;

CREATE OR REPLACE FUNCTION public.list_following(p_target uuid)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_premium boolean, is_supporter boolean, is_public boolean, follow_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f2.status from public.follows f2 where f2.following_id = p.id and f2.follower_id = auth.uid())
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_target and f.status = 'accepted'
    and (private.is_profile_public(p_target) or private.is_accepted_follower(p_target) or auth.uid() = p_target)
    and private.not_blocked(p_target) and private.not_blocked(p.id)   -- + block
  order by f.created_at desc
  limit 200
$function$
;

CREATE OR REPLACE FUNCTION public.list_host_is_premium(p_list uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select public.is_premium(l.user_id)
      from public.user_custom_lists l
     where l.id = p_list and private.can_edit_shared_list(l.id)
  ), false)
$function$
;

CREATE OR REPLACE FUNCTION public.list_invite_peek(p_key text)
 RETURNS TABLE(member_count integer, members jsonb, posters text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with l as (
    select l.id
      from public.user_custom_list_invites k
      join public.user_custom_lists l on l.id = k.list_id
     where k.invite_key = p_key
       and private.not_blocked(l.user_id)
  ), m as (
    select p.display_name, p.username, p.avatar_url, mm.created_at
      from l
      join public.user_custom_list_members mm on mm.list_id = l.id
      join public.profiles p on p.id = mm.user_id
     where private.not_blocked(mm.user_id)
  )
  select (select count(*)::int from m),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'display_name', coalesce(x.display_name, x.username),
                    'avatar_url', x.avatar_url) order by x.created_at)
             from (select * from m order by created_at limit 3) x
         ), '[]'::jsonb),
         array(
           select i.poster_path
             from public.user_custom_list_items i
            where i.list_id = l.id and i.poster_path is not null
            order by i.added_at desc nulls last
            limit 5
         )
    from l
$function$
;

CREATE OR REPLACE FUNCTION public.list_invite_preview(p_key text)
 RETURNS TABLE(list_id uuid, list_name text, item_count integer, owner_id uuid, username text, display_name text, avatar_url text, host_premium boolean, state text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when auth.uid() = l.user_id or m.user_id is not null then l.id end,
         l.name,
         (select count(*)::int from public.user_custom_list_items i where i.list_id = l.id),
         p.id, p.username, p.display_name, p.avatar_url,
         public.is_premium(l.user_id),
         case when auth.uid() is null then null
              when auth.uid() = l.user_id then 'owner'
              when m.user_id is not null then 'member'
              else 'none' end
    from public.user_custom_list_invites k
    join public.user_custom_lists l on l.id = k.list_id
    join public.profiles p on p.id = l.user_id
    left join public.user_custom_list_members m on m.list_id = l.id and m.user_id = auth.uid()
   where k.invite_key = p_key
     and private.not_blocked(l.user_id)
$function$
;

CREATE OR REPLACE FUNCTION public.list_notifications()
 RETURNS TABLE(id uuid, type text, actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text, post_id uuid, post_title text, post_poster_path text, created_at timestamp with time zone, read_at timestamp with time zone, tmdb_id integer, media_type text, season_number integer, media_title text, media_poster_path text, air_date date, person_tmdb_id integer, person_name text, person_role text, release_kind text, provider_name text, episode_number integer, episode_count integer, person_profile_path text, smart_list_digest jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at,
         n.tmdb_id, n.media_type, n.season_number,
         n.media_title, n.media_poster_path, n.air_date,
         n.person_tmdb_id, n.person_name, n.person_role,
         n.release_kind, n.provider_name,
         n.episode_number, n.episode_count,
         n.person_profile_path,
         n.smart_list_digest
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  left join public.feed_posts fp
    on fp.id = n.post_id
   and private.not_blocked(fp.author_id)
   and (
     auth.uid() = fp.author_id
     or private.is_profile_public(fp.author_id)
     or private.is_accepted_follower(fp.author_id)
   )
  where n.user_id = auth.uid()
    and (n.actor_id is null or (p.id is not null and private.not_blocked(n.actor_id)))
  order by n.created_at desc
  limit 50
$function$
;

CREATE OR REPLACE FUNCTION public.list_shared_list_people(p_lists uuid[])
 RETURNS TABLE(list_id uuid, user_id uuid, username text, display_name text, avatar_url text, is_owner boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select x.list_id, p.id, p.username, p.display_name, p.avatar_url, x.is_owner
    from (
      select l.id as list_id, l.user_id as uid, true as is_owner
        from public.user_custom_lists l
       where l.id = any (p_lists) and private.can_edit_shared_list(l.id)
         and exists (select 1 from public.user_custom_list_members m where m.list_id = l.id)
      union all
      select m.list_id, m.user_id, false
        from public.user_custom_list_members m
       where m.list_id = any (p_lists) and private.can_edit_shared_list(m.list_id)
    ) x
    join public.profiles p on p.id = x.uid
   where private.not_blocked(x.uid)
$function$
;

CREATE OR REPLACE FUNCTION public.list_watch_together()
 RETURNS TABLE(other_id uuid, username text, display_name text, avatar_url text, direction text, created_at timestamp with time zone, accepted_at timestamp with time zone, i_share_full boolean, overlap_count integer, can_decide boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.other_id, p.username, p.display_name, p.avatar_url,
         case when w.status = 'accepted' then 'paired'
              when w.recipient_id = auth.uid() then 'incoming'
              else 'outgoing' end,
         w.created_at, w.accepted_at,
         exists (select 1 from public.watchlist_viewers v where v.owner_id = auth.uid() and v.viewer_id = o.other_id),
         case when w.status = 'accepted' then public.watch_together_overlap_count(o.other_id) end,
         public.is_premium() or public.is_premium(o.other_id)
    from public.watch_together w
    cross join lateral (
      select case when w.requester_id = auth.uid() then w.recipient_id else w.requester_id end as other_id
    ) o
    join public.profiles p on p.id = o.other_id
   where auth.uid() in (w.requester_id, w.recipient_id)
     and (w.status = 'accepted' or w.created_at > now() - interval '30 days')
     and private.not_blocked(o.other_id)
   order by w.status = 'accepted' desc, coalesce(w.accepted_at, w.created_at) desc
$function$
;

CREATE OR REPLACE FUNCTION public.list_watchlist_viewer_candidates()
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_follower boolean, is_partner boolean, selected boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with people as (
    select f.follower_id as uid, true as is_follower, false as is_partner
      from public.follows f where f.following_id = auth.uid() and f.status = 'accepted'
    union all
    select case when w.requester_id = auth.uid() then w.recipient_id else w.requester_id end, false, true
      from public.watch_together w
     where w.status = 'accepted' and auth.uid() in (w.requester_id, w.recipient_id)
  ),
  merged as (
    select uid, bool_or(is_follower) as is_follower, bool_or(is_partner) as is_partner
      from people group by uid
  )
  select p.id, p.username, p.display_name, p.avatar_url, m.is_follower, m.is_partner,
         exists (select 1 from public.watchlist_viewers v where v.owner_id = auth.uid() and v.viewer_id = p.id)
    from merged m
    join public.profiles p on p.id = m.uid
   where private.not_blocked(p.id)
   order by 7 desc, lower(coalesce(p.display_name, p.username))
$function$
;

CREATE OR REPLACE FUNCTION public.remove_shared_list_item(p_list uuid, p_tmdb_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.can_edit_shared_list(p_list) then raise exception 'not_allowed'; end if;
  delete from public.user_custom_list_items where list_id = p_list and tmdb_id = p_tmdb_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rename_shared_list(p_list uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.can_edit_shared_list(p_list) or nullif(trim(p_name), '') is null then
    raise exception 'not_allowed';
  end if;
  update public.user_custom_lists set name = trim(p_name) where id = p_list;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_watch_together_request(p_requester uuid, p_accept boolean, p_share_full boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_accept then
    update public.watch_together
       set status = 'accepted', accepted_at = now()
     where requester_id = p_requester and recipient_id = auth.uid() and status = 'pending'
       and created_at > now() - interval '30 days'
       and private.not_blocked(p_requester);
    if found then
      if coalesce(p_share_full, false) then perform public.share_watchlist_with(p_requester, true, true); end if;
      insert into public.notifications (user_id, type, actor_id)
        values (p_requester, 'watch_together_accepted', auth.uid());
    end if;
  else
    delete from public.watch_together
     where requester_id = p_requester and recipient_id = auth.uid() and status = 'pending';
    if found then
      insert into public.watch_together_closed (requester_id, recipient_id) values (p_requester, auth.uid())
        on conflict (requester_id, recipient_id) do update set closed_at = now();
    end if;
  end if;
  delete from public.notifications
   where user_id = auth.uid() and actor_id = p_requester and type = 'watch_together_request';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_users(p_query text)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_premium boolean, is_supporter boolean, is_public boolean, follow_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid())
  from public.profiles p
  where length(trim(p_query)) >= 2
    and (p.username ilike trim(p_query) || '%' or p.display_name ilike '%' || trim(p_query) || '%')
    and (p.is_public or auth.uid() is not null)
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and private.not_blocked(p.id)                                    -- + block
  order by (p.username ilike trim(p_query) || '%') desc, p.username
  limit 25
$function$
;

CREATE OR REPLACE FUNCTION public.send_watch_together_request(p_recipient uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pref text;
  v_row  public.watch_together;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if p_recipient = auth.uid() or not private.not_blocked(p_recipient) then
    raise exception 'not_allowed';
  end if;

  select watch_together_requests_from into v_pref from public.profiles where id = p_recipient;
  if v_pref is null or v_pref = 'none' then raise exception 'not_allowed'; end if;
  if not (private.is_profile_public(p_recipient) or private.is_accepted_follower(p_recipient)) then
    raise exception 'not_allowed';
  end if;
  if v_pref = 'following' and not exists (
    select 1 from public.follows
     where follower_id = p_recipient and following_id = auth.uid() and status = 'accepted'
  ) then
    raise exception 'not_allowed';
  end if;

  v_row := public.watch_together_row(p_recipient);
  if v_row.requester_id is not null then
    if v_row.status = 'accepted' then return 'accepted'; end if;
    if v_row.recipient_id = auth.uid() then return 'incoming'; end if;
    return 'pending';
  end if;

  -- Clear an expired request in either direction before asking again.
  delete from public.watch_together
   where status = 'pending'
     and ((requester_id = auth.uid() and recipient_id = p_recipient)
       or (requester_id = p_recipient and recipient_id = auth.uid()));

  insert into public.watch_together (requester_id, recipient_id) values (auth.uid(), p_recipient);
  delete from public.watch_together_closed where requester_id = auth.uid() and recipient_id = p_recipient;
  insert into public.notifications (user_id, type, actor_id)
    values (p_recipient, 'watch_together_request', auth.uid());
  return 'pending';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_follow_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.status := case when private.is_profile_public(new.following_id) then 'accepted' else 'pending' end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.share_watchlist_with(p_viewer uuid, p_on boolean, p_promote boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or p_viewer is null or p_viewer = auth.uid() then raise exception 'not_allowed'; end if;
  if not p_on then
    delete from public.watchlist_viewers where owner_id = auth.uid() and viewer_id = p_viewer;
    return;
  end if;
  if not private.not_blocked(p_viewer) or not (
       exists (select 1 from public.follows f
                where f.follower_id = p_viewer and f.following_id = auth.uid() and f.status = 'accepted')
       or public.is_watch_together_partner(p_viewer)) then
    raise exception 'not_allowed';
  end if;
  insert into public.watchlist_viewers (owner_id, viewer_id) values (auth.uid(), p_viewer)
    on conflict do nothing;
  if p_promote and public.watchlist_visibility_of(auth.uid()) = 'private' then
    update public.profiles set watchlist_visibility = 'selected' where id = auth.uid();
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.suggest_watch_together()
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, overlap_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with links as (
    select case when f.follower_id = auth.uid() then f.following_id else f.follower_id end as uid,
           count(*) as directions
      from public.follows f
     where f.status = 'accepted' and auth.uid() in (f.follower_id, f.following_id)
     group by 1
  ),
  people as (
    select p.id, p.username, p.display_name, p.avatar_url, links.directions,
           case when private.can_view_watchlist(links.uid)
                then public.watch_together_overlap_count(links.uid) end as overlap_count
      from links
      join public.profiles p on p.id = links.uid
     where private.not_blocked(links.uid)
       and p.watch_together_requests_from <> 'none'
       and (p.watch_together_requests_from <> 'following' or exists (
         select 1 from public.follows f2
          where f2.follower_id = links.uid and f2.following_id = auth.uid() and f2.status = 'accepted'))
       and (private.is_profile_public(links.uid) or private.is_accepted_follower(links.uid))
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
$function$
;

CREATE OR REPLACE FUNCTION public.suggested_users(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_premium boolean, is_supporter boolean, is_public boolean, follow_status text, post_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_supporter, p.is_public,
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
    and private.not_blocked(p.id)                                    -- + block
  group by p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
           p.is_supporter, p.is_public
  order by count(fp.id) desc, p.username asc
  limit least(coalesce(p_limit, 20), 50)
$function$
;

CREATE OR REPLACE FUNCTION public.taste_overlap(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_target record;
  v_watchlist integer;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.is_premium(v_me) then
    raise exception 'premium_required' using errcode = '42501';
  end if;

  select p.id, p.username, p.display_name, p.avatar_url, coalesce(p.is_public, false) as is_public
    into v_target
    from public.profiles p
   where lower(p.username) = lower(ltrim(trim(p_username), '@'))
     and private.not_blocked(p.id);

  if not found or v_target.id = v_me then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not public.can_view_profile(v_target.id) then
    raise exception 'not_visible' using errcode = '42501';
  end if;

  if private.can_view_watchlist(v_target.id) then
    select count(*) into v_watchlist from (
      select tmdb_id, media_type from public.list_items where user_id = v_me
      intersect
      select tmdb_id, media_type from public.list_items where user_id = v_target.id
    ) shared;
  end if;

  return jsonb_build_object(
    'target', jsonb_build_object(
      'id', v_target.id,
      'username', v_target.username,
      'display_name', v_target.display_name,
      'avatar_url', v_target.avatar_url,
      'is_public', v_target.is_public
    ),
    'mine', public.taste_overlap_rows(v_me),
    'theirs', public.taste_overlap_rows(v_target.id),
    'shared_watchlist', v_watchlist
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.watch_together_link_owner(p_key text)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url
    from public.watch_together_links k
    join public.profiles p on p.id = k.user_id
   where k.link_key = p_key
     and private.not_blocked(p.id)
$function$
;

CREATE OR REPLACE FUNCTION public.watch_together_link_status(p_key text)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, state text, can_decide boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_row public.watch_together;
  v_state text := 'none';
begin
  if auth.uid() is null then return; end if;
  select k.user_id into v_owner from public.watch_together_links k where k.link_key = p_key;
  if v_owner is null or not private.not_blocked(v_owner) then return; end if;
  if v_owner = auth.uid() then
    v_state := 'self';
  else
    v_row := public.watch_together_row(v_owner);
    if v_row.requester_id is not null then
      v_state := case when v_row.status = 'accepted' then 'paired'
                      when v_row.recipient_id = auth.uid() then 'incoming'
                      else 'outgoing' end;
    end if;
  end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_url, v_state,
           public.is_premium() or public.is_premium(v_owner)
      from public.profiles p where p.id = v_owner;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.watch_together_savers(p_tmdb_id integer, p_media_type text)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url
    from public.watch_together w
    cross join lateral (
      select case when w.requester_id = auth.uid() then w.recipient_id else w.requester_id end as other_id
    ) o
    join public.profiles p on p.id = o.other_id
   where w.status = 'accepted'
     and auth.uid() in (w.requester_id, w.recipient_id)
     and private.not_blocked(o.other_id)
     and exists (select 1 from public.watchlist_keys(auth.uid()) k where k.tmdb_id = p_tmdb_id and k.media_type = p_media_type)
     and exists (select 1 from public.watchlist_keys(o.other_id) k where k.tmdb_id = p_tmdb_id and k.media_type = p_media_type)
   order by coalesce(p.display_name, p.username)
$function$
;

CREATE OR REPLACE FUNCTION public.watch_together_status(p_other uuid)
 RETURNS TABLE(state text, overlap_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.watch_together;
  v_state text := 'none';
begin
  if auth.uid() is null or p_other = auth.uid() or not private.not_blocked(p_other) then
    return;
  end if;
  v_row := public.watch_together_row(p_other);
  if v_row.requester_id is not null then
    v_state := case when v_row.status = 'accepted' then 'paired'
                    when v_row.recipient_id = auth.uid() then 'incoming'
                    else 'outgoing' end;
  end if;
  return query select v_state,
    case when v_state = 'paired' or private.can_view_watchlist(p_other)
         then public.watch_together_overlap_count(p_other) end;
end;
$function$
;


do $guard$
declare
  leftover text;
begin
  if to_regprocedure('public.not_blocked(uuid)') is not null
     or to_regprocedure('public.is_profile_public(uuid)') is not null
     or to_regprocedure('public.is_accepted_follower(uuid)') is not null
     or to_regprocedure('public.is_custom_list_member(uuid)') is not null
     or to_regprocedure('public.can_edit_shared_list(uuid)') is not null
     or to_regprocedure('public.can_view_watchlist(uuid)') is not null then
    raise exception 'an RLS helper is still in public';
  end if;

  if to_regprocedure('private.not_blocked(uuid)') is null
     or to_regprocedure('private.is_profile_public(uuid)') is null
     or to_regprocedure('private.is_accepted_follower(uuid)') is null
     or to_regprocedure('private.is_custom_list_member(uuid)') is null
     or to_regprocedure('private.can_edit_shared_list(uuid)') is null
     or to_regprocedure('private.can_view_watchlist(uuid)') is null then
    raise exception 'an RLS helper did not arrive in private';
  end if;

  select p.proname into leftover
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosrc ~ 'public\.(not_blocked|is_profile_public|is_accepted_follower|is_custom_list_member|can_edit_shared_list|can_view_watchlist)([^_a-z0-9]|$)';
  if leftover is not null then
    raise exception '% still calls a helper through the public schema', leftover;
  end if;
end
$guard$;

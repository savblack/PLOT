-- Watch together: "one of you needs Premium", and invite links.
--
-- Until now only a Premium member could send a request. From here anyone can
-- send one, and deciding together (shared titles, sessions) needs Premium on
-- at least one side. Pairing itself is free, so two Free members can pair and
-- it starts working the moment either upgrades.
--
-- Invite links are reusable, one per person, and carry a random key so a
-- username alone can't pair with anyone. Opening a link and accepting pairs
-- the visitor with its owner straight away: sharing the link is the owner's
-- consent, accepting is the visitor's. Resetting the key retires old links.
--
-- Design: docs/design/watch-together/README.md.

-- ── 1. Requests no longer need Premium ───────────────────────────────────────

-- Returns 'pending' (sent), 'accepted' (already partners) or 'incoming' (they
-- already asked you; answer that instead). Raises not_allowed.
create or replace function public.send_watch_together_request(p_recipient uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pref text;
  v_row  public.watch_together;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if p_recipient = auth.uid() or not public.not_blocked(p_recipient) then
    raise exception 'not_allowed';
  end if;

  select watch_together_requests_from into v_pref from public.profiles where id = p_recipient;
  if v_pref is null or v_pref = 'none' then raise exception 'not_allowed'; end if;
  if not (public.is_profile_public(p_recipient) or public.is_accepted_follower(p_recipient)) then
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
$$;

-- ── 2. Deciding needs Premium on at least one side ───────────────────────────

-- Same as 20260926130000 except the Premium rule: the caller or ANY partner in
-- the group (not only a single partner) having Premium is enough.
create or replace function public.watch_together_titles(p_others uuid[])
returns table (tmdb_id int, media_type text, title text, poster_path text,
               release_date text, genre_ids int[], provider_ids int[], saved_by uuid[])
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(array_length(p_others, 1), 0) = 0 then return; end if;
  if exists (select 1 from unnest(p_others) o where not public.is_watch_together_partner(o)) then
    raise exception 'not_allowed';
  end if;
  if not public.is_premium()
     and not exists (select 1 from unnest(p_others) o where public.is_premium(o)) then
    raise exception 'premium_required';
  end if;

  return query
  with members as (
    select auth.uid() as uid, true as full_visible
    union all
    select o, public.can_see_full_watchlist(o) from unnest(p_others) o
  ),
  mine as (select k.tmdb_id, k.media_type from public.watchlist_keys(auth.uid()) k),
  saves as (
    select m.uid, k.tmdb_id, k.media_type
      from members m
      cross join lateral public.watchlist_keys(m.uid) k
     where m.full_visible
        or exists (select 1 from mine where mine.tmdb_id = k.tmdb_id and mine.media_type = k.media_type)
  ),
  keyed as (
    select s.tmdb_id, s.media_type, array_agg(s.uid order by s.uid = auth.uid() desc) as saved_by
      from saves s
     group by s.tmdb_id, s.media_type
    having count(*) >= 2
  )
  select k.tmdb_id, k.media_type, meta.title::text, meta.poster_path::text, meta.release_date::text,
         meta.genre_ids::int[], meta.provider_ids::int[], k.saved_by
    from keyed k
    cross join lateral (
      select li.title, li.poster_path, li.release_date, li.genre_ids, li.provider_ids
        from public.list_items li
        join public.lists l on l.id = li.list_id and l.name = 'My List'
       where li.tmdb_id = k.tmdb_id and li.media_type = k.media_type
         and l.user_id = any (k.saved_by)
       order by l.user_id = auth.uid() desc
       limit 1
    ) meta
   order by array_length(k.saved_by, 1) desc, meta.title;
end;
$$;

-- list_watch_together gains can_decide: true when the caller or that partner
-- has Premium. The return type changes, so it is dropped and recreated.
drop function if exists public.list_watch_together();
create function public.list_watch_together()
returns table (other_id uuid, username text, display_name text, avatar_url text,
               direction text, created_at timestamptz, accepted_at timestamptz,
               i_share_full boolean, overlap_count int, can_decide boolean)
language sql stable security definer set search_path = public as $$
  select o.other_id, p.username, p.display_name, p.avatar_url,
         case when w.status = 'accepted' then 'paired'
              when w.recipient_id = auth.uid() then 'incoming'
              else 'outgoing' end,
         w.created_at, w.accepted_at,
         case when w.requester_id = auth.uid() then w.requester_shares_full else w.recipient_shares_full end,
         case when w.status = 'accepted' then public.watch_together_overlap_count(o.other_id) end,
         public.is_premium() or public.is_premium(o.other_id)
    from public.watch_together w
    cross join lateral (
      select case when w.requester_id = auth.uid() then w.recipient_id else w.requester_id end as other_id
    ) o
    join public.profiles p on p.id = o.other_id
   where auth.uid() in (w.requester_id, w.recipient_id)
     and (w.status = 'accepted' or w.created_at > now() - interval '30 days')
     and public.not_blocked(o.other_id)
   order by w.status = 'accepted' desc, coalesce(w.accepted_at, w.created_at) desc
$$;
revoke all on function public.list_watch_together() from public, anon;
grant execute on function public.list_watch_together() to authenticated;

-- suggest_watch_together gains overlap_count, returned only when that person's
-- watchlist is public (accepted followers of a private profile can't see its
-- watchlist, so a count would leak it). Free members now see this list too.
drop function if exists public.suggest_watch_together();
create function public.suggest_watch_together()
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
           case when public.is_profile_public(links.uid)
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
revoke all on function public.suggest_watch_together() from public, anon;
grant execute on function public.suggest_watch_together() to authenticated;

-- ── 3. Invite links ──────────────────────────────────────────────────────────

create table if not exists public.watch_together_links (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  link_key   text not null unique,
  created_at timestamptz not null default now()
);
alter table public.watch_together_links enable row level security;
-- No client policies: every read and write goes through the functions below.

create or replace function public.new_watch_together_link_key()
returns text language sql volatile set search_path = public as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
$$;
revoke all on function public.new_watch_together_link_key() from public, anon, authenticated;

-- The caller's link key, made on first use.
create or replace function public.my_watch_together_link()
returns text
language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  select link_key into v_key from public.watch_together_links where user_id = auth.uid();
  if v_key is null then
    insert into public.watch_together_links (user_id, link_key)
      values (auth.uid(), public.new_watch_together_link_key())
      on conflict (user_id) do nothing;
    select link_key into v_key from public.watch_together_links where user_id = auth.uid();
  end if;
  return v_key;
end;
$$;

-- A new key; links shared before stop working.
create or replace function public.reset_watch_together_link()
returns text
language plpgsql security definer set search_path = public as $$
declare v_key text := public.new_watch_together_link_key();
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  insert into public.watch_together_links (user_id, link_key) values (auth.uid(), v_key)
    on conflict (user_id) do update set link_key = excluded.link_key, created_at = now();
  return v_key;
end;
$$;

-- Who a link belongs to, for the landing page and the link preview. Readable
-- signed out, because the person opening it may not have an account yet.
-- Returns nothing for an unknown key or a blocked owner.
create or replace function public.watch_together_link_owner(p_key text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url
    from public.watch_together_links k
    join public.profiles p on p.id = k.user_id
   where k.link_key = p_key
     and public.not_blocked(p.id)
$$;

-- The signed-in visitor's side of a link: where things stand with its owner,
-- and whether either of you has Premium. state: 'self', 'none', 'outgoing',
-- 'incoming' or 'paired'.
create or replace function public.watch_together_link_status(p_key text)
returns table (id uuid, username text, display_name text, avatar_url text,
               state text, can_decide boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
  v_row public.watch_together;
  v_state text := 'none';
begin
  if auth.uid() is null then return; end if;
  select k.user_id into v_owner from public.watch_together_links k where k.link_key = p_key;
  if v_owner is null or not public.not_blocked(v_owner) then return; end if;
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
$$;

-- Accept a link: pairs the caller with its owner. Any request already
-- between you is accepted rather than duplicated. p_share_full is the
-- caller's "share my full watchlist". Returns 'accepted'; raises not_allowed.
create or replace function public.accept_watch_together_link(p_key text, p_share_full boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_row public.watch_together;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  select k.user_id into v_owner from public.watch_together_links k where k.link_key = p_key;
  if v_owner is null or v_owner = auth.uid() or not public.not_blocked(v_owner) then
    raise exception 'not_allowed';
  end if;

  v_row := public.watch_together_row(v_owner);
  if v_row.requester_id is not null and v_row.status = 'accepted' then return 'accepted'; end if;

  delete from public.watch_together
   where status = 'pending'
     and ((requester_id = auth.uid() and recipient_id = v_owner)
       or (requester_id = v_owner and recipient_id = auth.uid()));
  insert into public.watch_together (requester_id, recipient_id, status, accepted_at, recipient_shares_full)
    values (v_owner, auth.uid(), 'accepted', now(), coalesce(p_share_full, false));
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
$$;

revoke all on function public.my_watch_together_link() from public, anon;
revoke all on function public.reset_watch_together_link() from public, anon;
revoke all on function public.watch_together_link_owner(text) from public;
revoke all on function public.watch_together_link_status(text) from public, anon;
revoke all on function public.accept_watch_together_link(text, boolean) from public, anon;
grant execute on function public.my_watch_together_link() to authenticated;
grant execute on function public.reset_watch_together_link() to authenticated;
grant execute on function public.watch_together_link_owner(text) to anon, authenticated;
grant execute on function public.watch_together_link_status(text) to authenticated;
grant execute on function public.accept_watch_together_link(text, boolean) to authenticated;

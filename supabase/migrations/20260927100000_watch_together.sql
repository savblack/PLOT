-- Watch together (Premium): a consented pairing between two people so they can
-- see what they have both saved and decide what to watch. Design and agreed
-- rules: docs/design/watch-together/README.md.
--
-- A watch together request is its own consent step. It is not a follow and
-- never creates one. Only the sender needs Premium; the other person joins for
-- free. Declines are silent, requests expire after 30 days, and stopping or
-- blocking ends a pairing straight away.
--
-- Everything is additive: two new tables, one new profiles column, new
-- functions and one new trigger. No existing function is redefined; the
-- notifications type check is widened to two new types.

-- ── 1. Who may send you requests ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists watch_together_requests_from text not null default 'profile'
  check (watch_together_requests_from in ('profile', 'following', 'none'));

-- ── 2. Pairings (pending and accepted) ───────────────────────────────────────
-- One row per pair, whoever asked first. A pending row older than 30 days is
-- expired: every read ignores it and a new request replaces it. Clients never
-- write here directly; the functions below are the only writers.
create table if not exists public.watch_together (
  requester_id          uuid not null references auth.users(id) on delete cascade,
  recipient_id          uuid not null references auth.users(id) on delete cascade,
  status                text not null default 'pending' check (status in ('pending', 'accepted')),
  requester_shares_full boolean not null default false,
  recipient_shares_full boolean not null default false,
  created_at            timestamptz not null default now(),
  accepted_at           timestamptz,
  primary key (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

create unique index if not exists watch_together_pair_key
  on public.watch_together (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index if not exists watch_together_recipient_idx on public.watch_together (recipient_id);

alter table public.watch_together enable row level security;

drop policy if exists "watch together visible to both people" on public.watch_together;
create policy "watch together visible to both people" on public.watch_together
  for select to authenticated
  using (
    (auth.uid() = requester_id and public.not_blocked(recipient_id))
    or (auth.uid() = recipient_id and public.not_blocked(requester_id))
  );

-- Declined and cancelled requests, kept only so Suggested can leave that
-- person out for 60 days. Never exposed to clients.
create table if not exists public.watch_together_closed (
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  closed_at    timestamptz not null default now(),
  primary key (requester_id, recipient_id)
);
alter table public.watch_together_closed enable row level security;

-- ── 3. Notifications ─────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'watch_together_request', 'watch_together_accepted'));

-- ── 4. Helpers ───────────────────────────────────────────────────────────────

-- The live row between the caller and another person, either direction.
create or replace function public.watch_together_row(p_other uuid)
returns public.watch_together
language sql stable security definer set search_path = public as $$
  select w.* from public.watch_together w
   where ((w.requester_id = auth.uid() and w.recipient_id = p_other)
       or (w.requester_id = p_other and w.recipient_id = auth.uid()))
     and (w.status = 'accepted' or w.created_at > now() - interval '30 days')
   limit 1
$$;

-- True when the caller and p_other have an accepted pairing that isn't blocked.
create or replace function public.is_watch_together_partner(p_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.watch_together w
     where w.status = 'accepted'
       and ((w.requester_id = auth.uid() and w.recipient_id = p_other)
         or (w.requester_id = p_other and w.recipient_id = auth.uid()))
  ) and public.not_blocked(p_other)
$$;

-- True when the caller may see p_other's whole watchlist: their profile is
-- public, or they are partners and p_other turned on "share my full watchlist".
create or replace function public.can_see_full_watchlist(p_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.not_blocked(p_other) and (
    public.is_profile_public(p_other)
    or exists (
      select 1 from public.watch_together w
       where w.status = 'accepted'
         and ((w.requester_id = p_other and w.recipient_id = auth.uid() and w.requester_shares_full)
           or (w.recipient_id = p_other and w.requester_id = auth.uid() and w.recipient_shares_full))
    )
  )
$$;

-- A person's watchlist ("My List"), as (tmdb_id, media_type) keys.
create or replace function public.watchlist_keys(p_user uuid)
returns table (tmdb_id int, media_type text)
language sql stable security definer set search_path = public as $$
  select li.tmdb_id::int, li.media_type::text
    from public.list_items li
    join public.lists l on l.id = li.list_id
   where l.user_id = p_user and l.name = 'My List'
$$;
revoke all on function public.watchlist_keys(uuid) from public, anon, authenticated;

-- Titles on both the caller's and p_other's watchlists.
create or replace function public.watch_together_overlap_count(p_other uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select tmdb_id, media_type from public.watchlist_keys(auth.uid())
    intersect
    select tmdb_id, media_type from public.watchlist_keys(p_other)
  ) both_saved
$$;
revoke all on function public.watch_together_overlap_count(uuid) from public, anon, authenticated;

-- ── 5. Requests ──────────────────────────────────────────────────────────────

-- Returns 'pending' (sent), 'accepted' (already partners) or 'incoming' (they
-- already asked you; answer that instead). Raises premium_required or
-- not_allowed.
create or replace function public.send_watch_together_request(p_recipient uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pref text;
  v_row  public.watch_together;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if not public.is_premium() then raise exception 'premium_required'; end if;
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

-- Withdraw your own pending request. Silent for the other person.
create or replace function public.cancel_watch_together_request(p_recipient uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.watch_together
   where requester_id = auth.uid() and recipient_id = p_recipient and status = 'pending';
  if found then
    insert into public.watch_together_closed (requester_id, recipient_id) values (auth.uid(), p_recipient)
      on conflict (requester_id, recipient_id) do update set closed_at = now();
    delete from public.notifications
     where user_id = p_recipient and actor_id = auth.uid() and type = 'watch_together_request';
  end if;
end;
$$;

-- Accept or decline a request sent to you. Declines are silent. Accepting
-- tells the sender; p_share_full is the recipient's "share my full watchlist".
create or replace function public.respond_watch_together_request(
  p_requester uuid, p_accept boolean, p_share_full boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.watch_together
       set status = 'accepted', accepted_at = now(), recipient_shares_full = coalesce(p_share_full, false)
     where requester_id = p_requester and recipient_id = auth.uid() and status = 'pending'
       and created_at > now() - interval '30 days'
       and public.not_blocked(p_requester);
    if found then
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
$$;

-- Stop watching together, or drop any request between you. Unannounced.
create or replace function public.end_watch_together(p_other uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.watch_together
   where (requester_id = auth.uid() and recipient_id = p_other)
      or (requester_id = p_other and recipient_id = auth.uid())
$$;

-- The caller's own "share my full watchlist" choice for one partner.
create or replace function public.set_watch_together_share_full(p_other uuid, p_share boolean)
returns void
language sql security definer set search_path = public as $$
  update public.watch_together
     set requester_shares_full = case when requester_id = auth.uid() then p_share else requester_shares_full end,
         recipient_shares_full = case when recipient_id = auth.uid() then p_share else recipient_shares_full end
   where status = 'accepted'
     and ((requester_id = auth.uid() and recipient_id = p_other)
       or (requester_id = p_other and recipient_id = auth.uid()))
$$;

-- ── 6. Reads ─────────────────────────────────────────────────────────────────

-- Partners, incoming requests and sent requests for the hub and settings.
-- direction: 'paired', 'incoming' or 'outgoing'.
create or replace function public.list_watch_together()
returns table (other_id uuid, username text, display_name text, avatar_url text,
               direction text, created_at timestamptz, accepted_at timestamptz,
               i_share_full boolean, overlap_count int)
language sql stable security definer set search_path = public as $$
  select o.other_id, p.username, p.display_name, p.avatar_url,
         case when w.status = 'accepted' then 'paired'
              when w.recipient_id = auth.uid() then 'incoming'
              else 'outgoing' end,
         w.created_at, w.accepted_at,
         case when w.requester_id = auth.uid() then w.requester_shares_full else w.recipient_shares_full end,
         case when w.status = 'accepted' then public.watch_together_overlap_count(o.other_id) end
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

-- What a friend's profile tile needs. state: 'none', 'outgoing', 'incoming'
-- or 'paired'. overlap_count is only returned once you are partners or when
-- their watchlist is already public.
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
    case when v_state = 'paired' or public.is_profile_public(p_other)
         then public.watch_together_overlap_count(p_other) end;
end;
$$;

-- Titles for Watch together with one or more partners, with who saved each.
-- Every id in p_others must be the caller's partner, and the caller or (with a
-- single partner) that partner must have Premium. A title is included when at
-- least two people saved it and each saver other than the caller is visible to
-- the caller for that title: the caller saved it too, or the saver's full
-- watchlist is visible to the caller.
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
     and not (array_length(p_others, 1) = 1 and public.is_premium(p_others[1])) then
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

-- Up to five people to invite. Mutual follows first, then one-way follows;
-- within each, more titles in common first (counted only when that person's
-- watchlist is public). Leaves out partners, live requests, anyone blocked,
-- anyone whose request expired or was cancelled or declined in the last 60
-- days, and anyone whose request setting excludes the caller.
create or replace function public.suggest_watch_together()
returns table (id uuid, username text, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  with links as (
    select case when f.follower_id = auth.uid() then f.following_id else f.follower_id end as uid,
           count(*) as directions
      from public.follows f
     where f.status = 'accepted' and auth.uid() in (f.follower_id, f.following_id)
     group by 1
  )
  select p.id, p.username, p.display_name, p.avatar_url
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
   order by links.directions desc,
            case when public.is_profile_public(links.uid)
                 then public.watch_together_overlap_count(links.uid) else 0 end desc,
            p.username
   limit 5
$$;

-- ── 7. Blocking ends a pairing ───────────────────────────────────────────────
create or replace function public.sever_watch_together_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.watch_together
   where (requester_id = new.blocker_id and recipient_id = new.blocked_id)
      or (requester_id = new.blocked_id and recipient_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists on_user_block_sever_watch_together on public.user_blocks;
create trigger on_user_block_sever_watch_together
  after insert on public.user_blocks
  for each row execute function public.sever_watch_together_on_block();

-- ── 8. Grants ────────────────────────────────────────────────────────────────
revoke all on function public.watch_together_row(uuid) from public, anon;
revoke all on function public.is_watch_together_partner(uuid) from public, anon;
revoke all on function public.can_see_full_watchlist(uuid) from public, anon;
grant execute on function public.send_watch_together_request(uuid) to authenticated;
grant execute on function public.cancel_watch_together_request(uuid) to authenticated;
grant execute on function public.respond_watch_together_request(uuid, boolean, boolean) to authenticated;
grant execute on function public.end_watch_together(uuid) to authenticated;
grant execute on function public.set_watch_together_share_full(uuid, boolean) to authenticated;
grant execute on function public.list_watch_together() to authenticated;
grant execute on function public.watch_together_status(uuid) to authenticated;
grant execute on function public.watch_together_titles(uuid[]) to authenticated;
grant execute on function public.suggest_watch_together() to authenticated;
revoke all on function public.send_watch_together_request(uuid) from public, anon;
revoke all on function public.cancel_watch_together_request(uuid) from public, anon;
revoke all on function public.respond_watch_together_request(uuid, boolean, boolean) from public, anon;
revoke all on function public.end_watch_together(uuid) from public, anon;
revoke all on function public.set_watch_together_share_full(uuid, boolean) from public, anon;
revoke all on function public.list_watch_together() from public, anon;
revoke all on function public.watch_together_status(uuid) from public, anon;
revoke all on function public.watch_together_titles(uuid[]) from public, anon;
revoke all on function public.suggest_watch_together() from public, anon;

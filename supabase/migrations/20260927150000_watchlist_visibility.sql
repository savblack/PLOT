-- Who can see your watchlist ("Want to Watch"), set separately from the
-- profile. Until now list_items was readable through can_view_profile
-- (20260926090000), so every accepted follower of a private profile saw the
-- whole watchlist. Now:
--
--   profiles.watchlist_visibility   null (the default) | everyone | followers | selected | private
--     null      -> everyone for a public profile, private (only me) for a private one
--     everyone  -> anyone who can see the profile; on a private profile it acts as private,
--                  so going private never leaves the watchlist open to non-followers
--     followers -> accepted followers, plus anyone on your selected list
--     selected  -> only people on your selected list
--     private   -> only you
--
--   watchlist_viewers(owner_id, viewer_id)  the selected list. A row only counts
--     while the viewer is still an accepted follower or a Watch together partner,
--     and rows are pruned when that stops being true.
--
-- Everything that shows one person's watchlist to another goes through
-- can_view_watchlist(owner): the list_items read policy, Watch together
-- (can_see_full_watchlist, overlap counts) and taste_overlap's shared count.
--
-- Watch together's per-partner "Share my full watchlist" switch now adds or
-- removes that partner on the same selected list (one list, not two grants).
-- Existing requester_shares_full / recipient_shares_full flags are carried over
-- and the columns dropped. Turning the switch on while the watchlist is "only
-- me" changes it to "selected", since sharing with someone was the point.
--
-- Also drops two policies that exist on production but in no migration:
-- "public lists are readable" (lists.is_public) and "public list items are
-- readable" (list_items via lists.is_public). No list has is_public = true
-- today, but an owner can set it on their own list and bypass this setting.
--
-- Recreated from their latest bodies (only the lines named change):
--   can_see_full_watchlist        20260927140000  share-full terms -> can_view_watchlist
--   respond_watch_together_request 20260927100000 recipient_shares_full -> share_watchlist_with
--   set_watch_together_share_full 20260927100000  columns -> share_watchlist_with
--   accept_watch_together_link    20260927130000  recipient_shares_full -> share_watchlist_with
--   list_watch_together           20260927130000  i_share_full reads watchlist_viewers
--   watch_together_status         20260927100000  is_profile_public -> can_view_watchlist
--   suggest_watch_together        20260927130000  is_profile_public (overlap only) -> can_view_watchlist
--   taste_overlap                 20260926093000  shared_watchlist null unless can_view_watchlist

-- ── 1. Setting and selected list ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists watchlist_visibility text
  check (watchlist_visibility in ('everyone', 'followers', 'selected', 'private'));

create table if not exists public.watchlist_viewers (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);
create index if not exists watchlist_viewers_viewer_idx on public.watchlist_viewers (viewer_id);
alter table public.watchlist_viewers enable row level security;

drop policy if exists "owners read their watchlist viewers" on public.watchlist_viewers;
create policy "owners read their watchlist viewers" on public.watchlist_viewers
  for select to authenticated using (owner_id = auth.uid());

-- ── 2. The one rule ──────────────────────────────────────────────────────────

-- The setting that applies right now (see the table at the top).
create or replace function public.watchlist_visibility_of(p_owner uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
           when p.watchlist_visibility is null then case when coalesce(p.is_public, false) then 'everyone' else 'private' end
           when p.watchlist_visibility = 'everyone' and not coalesce(p.is_public, false) then 'private'
           else p.watchlist_visibility
         end
    from public.profiles p where p.id = p_owner
$$;

-- The caller is on p_owner's selected list and is still allowed to be:
-- an accepted follower or a Watch together partner.
create or replace function public.is_selected_watchlist_viewer(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.watchlist_viewers v
                  where v.owner_id = p_owner and v.viewer_id = auth.uid())
     and (public.is_accepted_follower(p_owner) or public.is_watch_together_partner(p_owner))
$$;

create or replace function public.can_view_watchlist(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_owner = auth.uid(), false)
      or (public.not_blocked(p_owner) and case public.watchlist_visibility_of(p_owner)
            when 'everyone'  then true
            when 'followers' then public.is_accepted_follower(p_owner) or public.is_selected_watchlist_viewer(p_owner)
            when 'selected'  then public.is_selected_watchlist_viewer(p_owner)
            else false
          end)
$$;

revoke all on function public.watchlist_visibility_of(uuid) from public, anon, authenticated;
revoke all on function public.is_selected_watchlist_viewer(uuid) from public, anon, authenticated;
revoke all on function public.can_view_watchlist(uuid) from public;
grant execute on function public.can_view_watchlist(uuid) to anon, authenticated;

comment on function public.can_view_watchlist(uuid) is
  'Who can read a watchlist: the owner; otherwise per profiles.watchlist_visibility (see 20260927150000). Never across a block. Every watchlist read, direct or through Watch together, uses this.';

-- ── 3. Read policies ─────────────────────────────────────────────────────────
drop policy if exists "public profiles list items readable" on public.list_items;
create policy "public profiles list items readable" on public.list_items
  for select to anon, authenticated
  using (public.can_view_watchlist(user_id));

drop policy if exists "public list items are readable" on public.list_items;
drop policy if exists "public lists are readable" on public.lists;

-- ── 4. Managing the selected list ────────────────────────────────────────────

-- Add or remove p_viewer on the caller's list. Only accepted followers and
-- Watch together partners can be added. When p_promote and the watchlist is
-- "only me", it becomes "selected" (Watch together's switch uses this).
create or replace function public.share_watchlist_with(p_viewer uuid, p_on boolean, p_promote boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_viewer is null or p_viewer = auth.uid() then raise exception 'not_allowed'; end if;
  if not p_on then
    delete from public.watchlist_viewers where owner_id = auth.uid() and viewer_id = p_viewer;
    return;
  end if;
  if not public.not_blocked(p_viewer) or not (
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
$$;

-- People the caller can choose from: accepted followers and Watch together
-- partners, with whether each is on the list now.
create or replace function public.list_watchlist_viewer_candidates()
returns table (id uuid, username text, display_name text, avatar_url text,
               is_follower boolean, is_partner boolean, selected boolean)
language sql stable security definer set search_path = public as $$
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
   where public.not_blocked(p.id)
   order by 7 desc, lower(coalesce(p.display_name, p.username))
$$;

revoke all on function public.share_watchlist_with(uuid, boolean, boolean) from public, anon;
grant execute on function public.share_watchlist_with(uuid, boolean, boolean) to authenticated;
revoke all on function public.list_watchlist_viewer_candidates() from public, anon;
grant execute on function public.list_watchlist_viewer_candidates() to authenticated;

-- ── 5. Pruning: a row lasts only while its viewer is a follower or partner ───
create or replace function public.prune_watchlist_viewer(p_owner uuid, p_viewer uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.watchlist_viewers v
   where v.owner_id = p_owner and v.viewer_id = p_viewer
     and not exists (select 1 from public.follows f
                      where f.follower_id = p_viewer and f.following_id = p_owner and f.status = 'accepted')
     and not exists (select 1 from public.watch_together w
                      where w.status = 'accepted'
                        and ((w.requester_id = p_owner and w.recipient_id = p_viewer)
                          or (w.requester_id = p_viewer and w.recipient_id = p_owner)))
$$;
revoke all on function public.prune_watchlist_viewer(uuid, uuid) from public, anon, authenticated;

create or replace function public.prune_watchlist_viewers_on_follow_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.prune_watchlist_viewer(old.following_id, old.follower_id);
  return null;
end;
$$;
drop trigger if exists on_follow_change_prune_watchlist_viewers on public.follows;
create trigger on_follow_change_prune_watchlist_viewers
  after delete or update of status on public.follows
  for each row execute function public.prune_watchlist_viewers_on_follow_change();

create or replace function public.prune_watchlist_viewers_on_watch_together_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.prune_watchlist_viewer(old.requester_id, old.recipient_id);
  perform public.prune_watchlist_viewer(old.recipient_id, old.requester_id);
  return old;
end;
$$;
drop trigger if exists on_watch_together_delete_prune_watchlist_viewers on public.watch_together;
create trigger on_watch_together_delete_prune_watchlist_viewers
  after delete on public.watch_together
  for each row execute function public.prune_watchlist_viewers_on_watch_together_delete();

create or replace function public.remove_watchlist_viewers_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.watchlist_viewers
   where (owner_id = new.blocker_id and viewer_id = new.blocked_id)
      or (owner_id = new.blocked_id and viewer_id = new.blocker_id);
  return new;
end;
$$;
drop trigger if exists on_user_block_remove_watchlist_viewers on public.user_blocks;
create trigger on_user_block_remove_watchlist_viewers
  after insert on public.user_blocks
  for each row execute function public.remove_watchlist_viewers_on_block();

revoke all on function public.prune_watchlist_viewers_on_follow_change() from public, anon, authenticated;
revoke all on function public.prune_watchlist_viewers_on_watch_together_delete() from public, anon, authenticated;
revoke all on function public.remove_watchlist_viewers_on_block() from public, anon, authenticated;

-- ── 6. Carry Watch together share-full flags onto the list ───────────────────
-- Guarded so a replay (the Staging proofs apply this inside a transaction)
-- still runs after the columns below are gone.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'watch_together'
                and column_name = 'requester_shares_full') then
    insert into public.watchlist_viewers (owner_id, viewer_id)
      select w.requester_id, w.recipient_id from public.watch_together w
       where w.status = 'accepted' and w.requester_shares_full
      union
      select w.recipient_id, w.requester_id from public.watch_together w
       where w.status = 'accepted' and w.recipient_shares_full
      on conflict do nothing;
  end if;
end $$;

update public.profiles p set watchlist_visibility = 'selected'
 where exists (select 1 from public.watchlist_viewers v where v.owner_id = p.id)
   and public.watchlist_visibility_of(p.id) = 'private';

-- ── 7. Watch together uses the same rule ─────────────────────────────────────
create or replace function public.can_see_full_watchlist(p_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_view_watchlist(p_other)
$$;
revoke all on function public.can_see_full_watchlist(uuid) from public, anon;

create or replace function public.respond_watch_together_request(
  p_requester uuid, p_accept boolean, p_share_full boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.watch_together
       set status = 'accepted', accepted_at = now()
     where requester_id = p_requester and recipient_id = auth.uid() and status = 'pending'
       and created_at > now() - interval '30 days'
       and public.not_blocked(p_requester);
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
$$;
revoke all on function public.respond_watch_together_request(uuid, boolean, boolean) from public, anon;
grant execute on function public.respond_watch_together_request(uuid, boolean, boolean) to authenticated;

create or replace function public.set_watch_together_share_full(p_other uuid, p_share boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_watch_together_partner(p_other) then return; end if;
  perform public.share_watchlist_with(p_other, coalesce(p_share, false), true);
end;
$$;
revoke all on function public.set_watch_together_share_full(uuid, boolean) from public, anon;
grant execute on function public.set_watch_together_share_full(uuid, boolean) to authenticated;

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
$$;
revoke all on function public.accept_watch_together_link(text, boolean) from public, anon;
grant execute on function public.accept_watch_together_link(text, boolean) to authenticated;

create or replace function public.list_watch_together()
returns table (other_id uuid, username text, display_name text, avatar_url text,
               direction text, created_at timestamptz, accepted_at timestamptz,
               i_share_full boolean, overlap_count int, can_decide boolean)
language sql stable security definer set search_path = public as $$
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
     and public.not_blocked(o.other_id)
   order by w.status = 'accepted' desc, coalesce(w.accepted_at, w.created_at) desc
$$;
revoke all on function public.list_watch_together() from public, anon;
grant execute on function public.list_watch_together() to authenticated;

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
    case when v_state = 'paired' or public.can_view_watchlist(p_other)
         then public.watch_together_overlap_count(p_other) end;
end;
$$;
revoke all on function public.watch_together_status(uuid) from public, anon;
grant execute on function public.watch_together_status(uuid) to authenticated;

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
           case when public.can_view_watchlist(links.uid)
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

-- Every writer of the share-full flags is recreated above, so the columns go.
alter table public.watch_together drop column if exists requester_shares_full;
alter table public.watch_together drop column if exists recipient_shares_full;

-- ── 8. Taste compare: no shared-watchlist count unless you can see it ────────
create or replace function public.taste_overlap(p_username text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_target record;
  v_watchlist integer;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not coalesce((select p.is_premium from public.profiles p where p.id = v_me), false) then
    raise exception 'premium_required' using errcode = '42501';
  end if;

  select p.id, p.username, p.display_name, p.avatar_url, coalesce(p.is_public, false) as is_public
    into v_target
    from public.profiles p
   where lower(p.username) = lower(ltrim(trim(p_username), '@'))
     and public.not_blocked(p.id);

  if not found or v_target.id = v_me then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not public.can_view_profile(v_target.id) then
    raise exception 'not_visible' using errcode = '42501';
  end if;

  if public.can_view_watchlist(v_target.id) then
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
$$;
revoke all on function public.taste_overlap(text) from public, anon;
grant execute on function public.taste_overlap(text) to authenticated;

comment on function public.taste_overlap(text) is
  'Premium taste comparison. Returns history for a profile the caller can already read (can_view_profile), and a watchlist overlap count only when the caller can see that watchlist (can_view_watchlist); otherwise shared_watchlist is null. Block-filtered; see scripts/check-block-clause.mjs.';

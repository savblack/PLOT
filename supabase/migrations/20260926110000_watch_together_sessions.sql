-- Watch together, phase 2: the two-person yes-or-no session. Builds on
-- 20260926100000_watch_together.sql. Design: docs/design/watch-together/README.md.
--
-- One person starts a session with a partner. The deck is a snapshot of the
-- titles they have both saved, shuffled once so both see the same order. Each
-- person votes yes or no; a title both say yes to is a match. Neither sees the
-- other's individual votes, only how far through they are and the matches.
--
-- Clients never write these tables directly and have no select policy: every
-- read and write goes through the functions below. Live updates are a
-- Realtime broadcast ping on a channel named after the session id, and the
-- client re-reads through get_watch_together_session, so no table is added to
-- the realtime publication and no row is exposed to it.
--
-- Additive: two tables, new functions, and one more notification type.

create table if not exists public.watch_together_sessions (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references auth.users(id) on delete cascade,
  guest_id   uuid not null references auth.users(id) on delete cascade,
  deck       jsonb not null default '[]'::jsonb,  -- [{ tmdb_id, media_type }], in play order
  status     text not null default 'live' check (status in ('live', 'ended')),
  created_at timestamptz not null default now(),
  ended_at   timestamptz,
  check (host_id <> guest_id)
);
create index if not exists watch_together_sessions_host_idx on public.watch_together_sessions (host_id, status);
create index if not exists watch_together_sessions_guest_idx on public.watch_together_sessions (guest_id, status);
alter table public.watch_together_sessions enable row level security;

create table if not exists public.watch_together_votes (
  session_id uuid not null references public.watch_together_sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  tmdb_id    int not null,
  media_type text not null,
  yes        boolean not null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, tmdb_id, media_type)
);
alter table public.watch_together_votes enable row level security;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like',
                  'watch_together_request', 'watch_together_accepted',
                  'watch_together_session'));

-- A session counts as live for 12 hours; after that it reads as ended.
create or replace function public.watch_together_session_live(s public.watch_together_sessions)
returns boolean
language sql stable as $$
  select s.status = 'live' and s.created_at > now() - interval '12 hours'
$$;

-- The session row, only for its two people, and only while they are still
-- partners and not blocked.
create or replace function public.watch_together_session_for_caller(p_session uuid)
returns public.watch_together_sessions
language sql stable security definer set search_path = public as $$
  select s.* from public.watch_together_sessions s
   where s.id = p_session
     and auth.uid() in (s.host_id, s.guest_id)
     and public.is_watch_together_partner(case when s.host_id = auth.uid() then s.guest_id else s.host_id end)
$$;

-- Start deciding with a partner. Ends any live session between the two of you
-- first, snapshots the titles you have both saved in a shuffled order, and
-- tells the partner. Returns the new session id.
create or replace function public.start_watch_together_session(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_deck jsonb;
begin
  if auth.uid() is null or not public.is_watch_together_partner(p_other) then
    raise exception 'not_allowed';
  end if;
  if not public.is_premium() and not public.is_premium(p_other) then
    raise exception 'premium_required';
  end if;

  update public.watch_together_sessions
     set status = 'ended', ended_at = now()
   where status = 'live'
     and ((host_id = auth.uid() and guest_id = p_other) or (host_id = p_other and guest_id = auth.uid()));

  -- Two-person titles are always ones you both saved (at least two savers).
  select coalesce(jsonb_agg(jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', t.media_type) order by random()), '[]'::jsonb)
    into v_deck
    from public.watch_together_titles(array[p_other]) t;

  insert into public.watch_together_sessions (host_id, guest_id, deck)
    values (auth.uid(), p_other, v_deck)
    returning id into v_id;

  delete from public.notifications
   where user_id = p_other and actor_id = auth.uid() and type = 'watch_together_session';
  insert into public.notifications (user_id, type, actor_id)
    values (p_other, 'watch_together_session', auth.uid());
  return v_id;
end;
$$;

-- The live session with a partner, if there is one (for Join links).
create or replace function public.live_watch_together_session(p_other uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.watch_together_sessions s
   where ((s.host_id = auth.uid() and s.guest_id = p_other) or (s.host_id = p_other and s.guest_id = auth.uid()))
     and public.watch_together_session_live(s)
     and public.is_watch_together_partner(p_other)
   order by s.created_at desc
   limit 1
$$;

-- Everything the session screen needs, from the caller's side: the deck with
-- title details, the caller's own votes, how many cards the other person has
-- answered, and the matches. The other person's individual votes stay hidden.
create or replace function public.get_watch_together_session(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s       public.watch_together_sessions;
  v_other uuid;
begin
  s := public.watch_together_session_for_caller(p_session);
  if s.id is null then raise exception 'not_allowed'; end if;
  v_other := case when s.host_id = auth.uid() then s.guest_id else s.host_id end;

  return jsonb_build_object(
    'id', s.id,
    'other_id', v_other,
    'live', public.watch_together_session_live(s),
    'deck', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tmdb_id', (d->>'tmdb_id')::int, 'media_type', d->>'media_type',
               'title', meta.title, 'poster_path', meta.poster_path, 'release_date', meta.release_date)
             order by ord)
        from jsonb_array_elements(s.deck) with ordinality as e(d, ord)
        left join lateral (
          select li.title::text as title, li.poster_path::text as poster_path, li.release_date::text as release_date
            from public.list_items li
            join public.lists l on l.id = li.list_id and l.name = 'My List'
           where li.tmdb_id = (d->>'tmdb_id')::int and li.media_type = d->>'media_type'
             and l.user_id in (s.host_id, s.guest_id)
           order by l.user_id = auth.uid() desc
           limit 1
        ) meta on true
    ), '[]'::jsonb),
    'my_votes', coalesce((
      select jsonb_agg(jsonb_build_object('tmdb_id', v.tmdb_id, 'media_type', v.media_type, 'yes', v.yes))
        from public.watch_together_votes v
       where v.session_id = s.id and v.user_id = auth.uid()
    ), '[]'::jsonb),
    'other_answered', (
      select count(*) from public.watch_together_votes v
       where v.session_id = s.id and v.user_id = v_other
    ),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object('tmdb_id', a.tmdb_id, 'media_type', a.media_type))
        from public.watch_together_votes a
        join public.watch_together_votes b
          on b.session_id = a.session_id and b.tmdb_id = a.tmdb_id and b.media_type = a.media_type
         and b.user_id = v_other and b.yes
       where a.session_id = s.id and a.user_id = auth.uid() and a.yes
    ), '[]'::jsonb)
  );
end;
$$;

-- Answer one card. Returns true when this makes it a match.
create or replace function public.vote_watch_together(
  p_session uuid, p_tmdb_id int, p_media_type text, p_yes boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s       public.watch_together_sessions;
  v_other uuid;
begin
  s := public.watch_together_session_for_caller(p_session);
  if s.id is null or not public.watch_together_session_live(s) then raise exception 'not_allowed'; end if;
  if not exists (
    select 1 from jsonb_array_elements(s.deck) d
     where (d->>'tmdb_id')::int = p_tmdb_id and d->>'media_type' = p_media_type
  ) then
    raise exception 'not_allowed';
  end if;
  v_other := case when s.host_id = auth.uid() then s.guest_id else s.host_id end;

  insert into public.watch_together_votes (session_id, user_id, tmdb_id, media_type, yes)
    values (s.id, auth.uid(), p_tmdb_id, p_media_type, p_yes)
    on conflict (session_id, user_id, tmdb_id, media_type) do update set yes = excluded.yes, created_at = now();

  return p_yes and exists (
    select 1 from public.watch_together_votes
     where session_id = s.id and user_id = v_other and tmdb_id = p_tmdb_id and media_type = p_media_type and yes
  );
end;
$$;

-- Either person can end the session.
create or replace function public.end_watch_together_session(p_session uuid)
returns void
language sql security definer set search_path = public as $$
  update public.watch_together_sessions
     set status = 'ended', ended_at = now()
   where id = p_session and status = 'live' and auth.uid() in (host_id, guest_id)
$$;

-- Ending a pairing (stop, or block, which deletes the pairing) ends its
-- sessions too, so a stale Join link can't reopen one.
create or replace function public.end_sessions_on_watch_together_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.watch_together_sessions
     set status = 'ended', ended_at = now()
   where status = 'live'
     and ((host_id = old.requester_id and guest_id = old.recipient_id)
       or (host_id = old.recipient_id and guest_id = old.requester_id));
  return old;
end;
$$;

drop trigger if exists on_watch_together_delete_end_sessions on public.watch_together;
create trigger on_watch_together_delete_end_sessions
  after delete on public.watch_together
  for each row execute function public.end_sessions_on_watch_together_delete();

revoke all on function public.watch_together_session_for_caller(uuid) from public, anon, authenticated;
revoke all on function public.start_watch_together_session(uuid) from public, anon;
revoke all on function public.live_watch_together_session(uuid) from public, anon;
revoke all on function public.get_watch_together_session(uuid) from public, anon;
revoke all on function public.vote_watch_together(uuid, int, text, boolean) from public, anon;
revoke all on function public.end_watch_together_session(uuid) from public, anon;
grant execute on function public.start_watch_together_session(uuid) to authenticated;
grant execute on function public.live_watch_together_session(uuid) to authenticated;
grant execute on function public.get_watch_together_session(uuid) to authenticated;
grant execute on function public.vote_watch_together(uuid, int, text, boolean) to authenticated;
grant execute on function public.end_watch_together_session(uuid) to authenticated;

-- Watch together: start a two-person session with a mood (Nov 21 2026).
-- Design: the "mood step" in docs/design/watch-together/README.md.
--
-- Before the cards, the starter picks Movies or TV, moods (genres) and
-- "My services". The deck is then only the shared titles that fit, and the
-- choice is kept on the session so the other person sees what was picked.
--
-- Additive only:
--   * watch_together_sessions.filters, nullable. Old sessions and sessions
--     started the old way keep null.
--   * start_watch_together_session_filtered(uuid, jsonb), new. The old
--     start_watch_together_session(uuid) is untouched, because installed
--     iPhone builds still call it.
--   * get_watch_together_session also returns 'filters'. The body below is
--     the live one from 20260927110000 (no later migration redefines it) with
--     one added line.
--
-- Input: only the known keys, each list capped at 50 entries, moods limited
-- to the known names. The stored moods are labels for the partner; they are
-- not re-checked against genre_ids, so a hand-made call could show a label
-- that doesn't match its deck (seen only by its own partner).
--
-- Filtering uses only what list_items already stores (genre_ids,
-- provider_ids), so it needs no TMDB call. Moods are an OR across genres;
-- Movies/TV and services narrow. An empty result raises 'nothing_fits'
-- rather than creating a session with no cards.

alter table public.watch_together_sessions add column if not exists filters jsonb;

create or replace function public.start_watch_together_session_filtered(p_other uuid, p_filters jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id        uuid;
  v_deck      jsonb;
  v_media     text;
  v_genres    int[];
  v_providers int[];
  v_moods     text[];
begin
  if auth.uid() is null or not public.is_watch_together_partner(p_other) then
    raise exception 'not_allowed';
  end if;
  if not public.is_premium() and not public.is_premium(p_other) then
    raise exception 'premium_required';
  end if;

  -- Only the known keys, with their expected types; anything else is ignored.
  v_media := case when p_filters->>'media_type' in ('movie', 'tv') then p_filters->>'media_type' end;
  select coalesce(array_agg(distinct g::int), '{}')
    into v_genres
    from jsonb_array_elements_text(case when jsonb_typeof(p_filters->'genre_ids') = 'array' then p_filters->'genre_ids' else '[]'::jsonb end) with ordinality as e(g, n)
   where g ~ '^[0-9]{1,7}$' and n <= 50;
  select coalesce(array_agg(distinct p::int), '{}')
    into v_providers
    from jsonb_array_elements_text(case when jsonb_typeof(p_filters->'provider_ids') = 'array' then p_filters->'provider_ids' else '[]'::jsonb end) with ordinality as e(p, n)
   where p ~ '^[0-9]{1,7}$' and n <= 50;
  select coalesce(array_agg(distinct m), '{}')
    into v_moods
    from jsonb_array_elements_text(case when jsonb_typeof(p_filters->'moods') = 'array' then p_filters->'moods' else '[]'::jsonb end) m
   -- The mood names in packages/core/moodGenres.js (MOODS); a unit test keeps
   -- the two lists the same. Only labels: the deck is filtered by genre_ids.
   where m in ('funny', 'romantic', 'gripping', 'scary', 'moving', 'adventurous', 'mindBending', 'trueStory', 'animated');

  select coalesce(jsonb_agg(jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', t.media_type) order by random()), '[]'::jsonb)
    into v_deck
    from public.watch_together_titles(array[p_other]) t
   where (v_media is null or t.media_type = v_media)
     and (cardinality(v_genres) = 0 or coalesce(t.genre_ids, '{}') && v_genres)
     and (cardinality(v_providers) = 0 or coalesce(t.provider_ids, '{}') && v_providers);

  if jsonb_array_length(v_deck) = 0 then
    raise exception 'nothing_fits';
  end if;

  update public.watch_together_sessions
     set status = 'ended', ended_at = now()
   where status = 'live'
     and ((host_id = auth.uid() and guest_id = p_other) or (host_id = p_other and guest_id = auth.uid()));

  insert into public.watch_together_sessions (host_id, guest_id, deck, filters)
    values (auth.uid(), p_other, v_deck, jsonb_build_object(
      'by', auth.uid(),
      'media_type', v_media,
      'moods', to_jsonb(v_moods),
      'services', cardinality(v_providers) > 0))
    returning id into v_id;

  delete from public.notifications
   where user_id = p_other and actor_id = auth.uid() and type = 'watch_together_session';
  insert into public.notifications (user_id, type, actor_id)
    values (p_other, 'watch_together_session', auth.uid());
  return v_id;
end;
$$;

revoke execute on function public.start_watch_together_session_filtered(uuid, jsonb) from public, anon;
grant execute on function public.start_watch_together_session_filtered(uuid, jsonb) to authenticated;

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
    'filters', s.filters,
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

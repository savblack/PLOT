-- Taste overlap: the Premium "Deeper viewing stats" comparison between the
-- viewer and one other person (packages/core/tasteOverlap.js does the maths).
--
-- WHAT THIS RETURNS, AND WHY IT WIDENS NOTHING
-- Both people's watch history (one row per title), plus a count of titles on
-- both watchlists. Every row it hands back is one the caller could already
-- select through RLS: since 20260926090000_unified_profile_visibility, history
-- and list_items are both readable exactly when can_view_profile(owner) is
-- true (owner, public profile, or accepted follower; never across a block).
-- The visibility test below is that function, so this cannot drift from the
-- policies: change who can see a profile there and this follows.
--
-- WHY A SECURITY DEFINER RPC AT ALL
-- For the Premium gate. The client pre-checks profile.is_premium for friendlier
-- UX, but the database is the authority (see packages/core/premium.js), and a
-- plain table read cannot express "only Premium viewers". The caller's own
-- profiles.is_premium is the flag, the same one protect_premium_flag() guards.
-- The person being compared with can be on Free.
--
-- Blocked and nonexistent targets are indistinguishable ('not_found'), as on
-- get_profile_card: a distinct error would turn blocking into a notification.
-- A private target the caller does not follow is 'not_visible'; that reveals
-- nothing get_profile_card does not already show a signed-in viewer.
--
-- This reads public.profiles, so it is listed in BLOCK_FILTERED in
-- scripts/check-block-clause.mjs and must keep its not_blocked conjunct.

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

  select count(*) into v_watchlist from (
    select tmdb_id, media_type from public.list_items where user_id = v_me
    intersect
    select tmdb_id, media_type from public.list_items where user_id = v_target.id
  ) shared;

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

-- History is one row per title (rewatch rows went in 20260806000001), so this
-- is a straight projection of the columns the comparison needs. Internal to
-- taste_overlap, which has already checked visibility, so it is not granted to
-- anyone.
create or replace function public.taste_overlap_rows(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tmdb_id', h.tmdb_id,
           'media_type', h.media_type,
           'title', h.title,
           'poster_path', h.poster_path,
           'rating', h.rating,
           'genre_ids', h.genre_ids,
           'release_date', h.release_date
         )), '[]'::jsonb)
    from public.history h
   where h.user_id = p_user
$$;

revoke all on function public.taste_overlap_rows(uuid) from public, anon, authenticated;
revoke all on function public.taste_overlap(text) from public, anon;
grant execute on function public.taste_overlap(text) to authenticated;

comment on function public.taste_overlap(text) is
  'Premium taste comparison. Returns history and a watchlist overlap count for a profile the caller can already read (can_view_profile). Block-filtered; see scripts/check-block-clause.mjs.';

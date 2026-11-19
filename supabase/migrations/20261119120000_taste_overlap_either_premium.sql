-- Compare (taste_overlap) needs Premium on one side, not on the viewer's.
--
-- Until now a Free viewer was refused before the target was even looked up.
-- Watch together already works this way (20260927130000_watch_together_free:
-- "is_premium() or is_premium(other)"), and Compare now matches it
-- (Savannah, 18 Nov 2026): if either person has Premium, both can compare.
--
-- Recreated from the live body (20261012150000_move_rls_helpers_private.sql).
-- Two changes only:
--   1. The Premium test moves below the target lookup and visibility check,
--      because it now needs the target's id. A Free viewer asking about a
--      missing, blocked or unreadable profile therefore gets not_found /
--      not_visible, the same answers a Premium viewer gets, instead of
--      premium_required. Neither reveals anything the profile page does not.
--   2. It passes when is_premium(v_me) or is_premium(v_target.id). Both read
--      billing_customers, never the cosmetic profiles.is_premium badge
--      (20261002100000).
-- Everything else (not_blocked, can_view_profile, can_view_watchlist, the
-- returned shape, grants) is unchanged. Still listed in BLOCK_FILTERED in
-- scripts/check-block-clause.mjs.

create or replace function public.taste_overlap(p_username text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_target record;
  v_watchlist integer;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
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

  -- Premium on either side unlocks the comparison for both.
  if not public.is_premium(v_me) and not public.is_premium(v_target.id) then
    raise exception 'premium_required' using errcode = '42501';
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
$function$;

comment on function public.taste_overlap(text) is
  'Taste comparison. Needs Premium on either side (the caller or the target). Returns history for a profile the caller can already read (can_view_profile), and a watchlist overlap count only when the caller can see that watchlist (can_view_watchlist); otherwise shared_watchlist is null. Block-filtered; see scripts/check-block-clause.mjs.';

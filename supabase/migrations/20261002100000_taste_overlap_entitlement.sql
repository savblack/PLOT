-- taste_overlap's Premium gate reads the subscription, not the badge.
--
-- 20260926093000 gated on the caller's profiles.is_premium. That column is the
-- cosmetic badge: the web app never trusts it (App.jsx replaces it with
-- is_premium() on every load, see packages/core/billing.js), and every other
-- Premium gate in the database calls public.is_premium(), which reads
-- billing_customers. The two disagree in both directions:
--
--   - a subscription that lapses with no Stripe event keeps the badge until
--     refresh_premium_badges() next runs (hourly), so the RPC still answered
--     for someone the app already showed the upsell to;
--   - a legacy Ko-fi supporter holds the badge with no billing row (see
--     20260926160000), so the app showed them the upsell while the RPC would
--     have let them in.
--
-- Now the server and the client ask the same question. Recreated from the
-- latest body (20260927160000_watchlist_visibility.sql); only the Premium
-- line changes. taste_overlap_rows is untouched.
--
-- Still listed in BLOCK_FILTERED in scripts/check-block-clause.mjs and keeps
-- its not_blocked conjunct.

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

  if not public.is_premium(v_me) then
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

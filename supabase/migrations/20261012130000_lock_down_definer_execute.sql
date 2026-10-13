-- Close the Security Advisor warnings that are accidental exposure.
--
-- PostgREST publishes every function in public that anon or authenticated
-- can execute. Default privileges grant execute to both, including on
-- trigger functions and helpers that no screen calls. A SECURITY DEFINER
-- function then runs as postgres and bypasses RLS.
--
-- Revoked from anon and authenticated: trigger functions, and helpers that
-- are only reached from other SECURITY DEFINER functions (those run as
-- postgres, who owns them). Triggers still fire. Postgres does not consult
-- the session user's EXECUTE privilege when a trigger calls its function.
--
-- Revoked from anon only: signed-in RPCs that were also granted to anon,
-- and is_premium(uuid). The notification_preferences trigger and the
-- premium-alert policies call is_premium as the signed-in user, so
-- authenticated keeps it. anon cannot write that table.
--
-- Still granted, so the matching advisor rows stay:
--   anon and authenticated: profile, follow, invite, and shared-list RPCs
--     a logged-out visitor hits, plus the RLS helpers can_view_profile and
--     can_view_custom_list call (is_profile_public, is_accepted_follower,
--     not_blocked, can_view_watchlist, can_create_custom_list).
--   authenticated: the rest of the app's RPCs.
--
-- search_path is pinned on the six functions the advisor named. citext
-- moves to extensions. The API extra search path is already
-- "public, extensions". marketing_recipient_list and
-- sync_marketing_subscription cast those columns to text under
-- search_path = "".

alter function public.profile_links_ok(jsonb) set search_path = public;
alter function public.protect_premium_flag() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.swap_top_list_ranks(uuid, text, integer, integer) set search_path = public;
alter function public.update_watching_progress_updated_at() set search_path = public;
alter function public.watch_together_session_live(public.watch_together_sessions) set search_path = public;

do $move_citext$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext'
      and n.nspname = 'public'
  ) then
    alter extension citext set schema extensions;
  end if;
end
$move_citext$;

revoke execute on function public.end_sessions_on_watch_together_delete() from public, anon, authenticated;
revoke execute on function public.enforce_custom_list_creation_cap() from public, anon, authenticated;
revoke execute on function public.feed_post_from_favourite() from public, anon, authenticated;
revoke execute on function public.feed_post_from_history() from public, anon, authenticated;
revoke execute on function public.feed_post_from_top_list() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_edge_function() from public, anon, authenticated;
revoke execute on function public.notify_follow_event() from public, anon, authenticated;
revoke execute on function public.notify_new_signup() from public, anon, authenticated;
revoke execute on function public.remove_list_members_on_block() from public, anon, authenticated;
revoke execute on function public.set_follow_status() from public, anon, authenticated;
revoke execute on function public.set_username_on_insert() from public, anon, authenticated;
revoke execute on function public.sever_follows_on_block() from public, anon, authenticated;
revoke execute on function public.sever_watch_together_on_block() from public, anon, authenticated;
revoke execute on function public.sync_marketing_subscription() from public, anon, authenticated;
revoke execute on function public.sync_profile_marketing_flag() from public, anon, authenticated;
revoke execute on function public.generate_username(text) from public, anon, authenticated;
revoke execute on function public.run_marketing_notion_mirror() from public, anon, authenticated;
revoke execute on function public.can_see_full_watchlist(uuid) from public, anon, authenticated;
revoke execute on function public.is_watch_together_partner(uuid) from public, anon, authenticated;
revoke execute on function public.watch_together_row(uuid) from public, anon, authenticated;

-- PUBLIC includes anon. Take that away, then put the signed-in grant back.
revoke execute on function public.list_blocked_users() from public, anon;
revoke execute on function public.list_follow_requests() from public, anon;
revoke execute on function public.search_users(text) from public, anon;
revoke execute on function public.suggested_users(integer) from public, anon;
revoke execute on function public.is_premium(uuid) from public, anon;

grant execute on function public.list_blocked_users() to authenticated, service_role;
grant execute on function public.list_follow_requests() to authenticated, service_role;
grant execute on function public.search_users(text) to authenticated, service_role;
grant execute on function public.suggested_users(integer) to authenticated, service_role;
grant execute on function public.is_premium(uuid) to authenticated, service_role;

-- Asserts only the grants this migration removes. db:migration-test restores
-- with --no-privileges, so a check that authenticated still has execute would
-- fail there on a correct migration.
do $guard$
declare
  fn text;
begin
  foreach fn in array array[
    'public.end_sessions_on_watch_together_delete()',
    'public.enforce_custom_list_creation_cap()',
    'public.feed_post_from_favourite()',
    'public.feed_post_from_history()',
    'public.feed_post_from_top_list()',
    'public.handle_new_user()',
    'public.notify_edge_function()',
    'public.notify_follow_event()',
    'public.notify_new_signup()',
    'public.remove_list_members_on_block()',
    'public.set_follow_status()',
    'public.set_username_on_insert()',
    'public.sever_follows_on_block()',
    'public.sever_watch_together_on_block()',
    'public.sync_marketing_subscription()',
    'public.sync_profile_marketing_flag()',
    'public.generate_username(text)',
    'public.run_marketing_notion_mirror()',
    'public.can_see_full_watchlist(uuid)',
    'public.is_watch_together_partner(uuid)',
    'public.watch_together_row(uuid)'
  ]
  loop
    if has_function_privilege('anon', fn, 'execute')
       or has_function_privilege('authenticated', fn, 'execute') then
      raise exception '% is still executable by anon or authenticated', fn;
    end if;
  end loop;

  foreach fn in array array[
    'public.list_blocked_users()',
    'public.list_follow_requests()',
    'public.search_users(text)',
    'public.suggested_users(integer)',
    'public.is_premium(uuid)'
  ]
  loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception '% is still executable by anon', fn;
    end if;
  end loop;

  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext'
      and n.nspname = 'public'
  ) then
    raise exception 'citext is still in public';
  end if;
end
$guard$;

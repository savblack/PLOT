-- Watch together: two fixes on top of 20260927100000 to 20260927130000.
-- Design: docs/design/watch-together/README.md.
--
-- 1. can_see_full_watchlist now agrees with the watchlist read policy.
--    Since 20260926090000, list_items is readable through
--    can_view_profile(user_id): the owner, anyone for a public profile, and
--    accepted followers for a private one. can_see_full_watchlist only checked
--    is_profile_public, so for a partner who also follows a private profile,
--    Watch together treated the watchlist as hidden unless "share my full
--    watchlist" was on, while that partner could already read all of it. The
--    follower rule is deliberate and stays as it is; this makes Watch together
--    use the same rule, so the switch only adds access for a partner who can't
--    already see the profile.
--
-- 2. Stopping watching together removes each person from the other's shared
--    lists, the same way blocking already does (remove_list_members_on_block).
--    It fires on any delete of an accepted pairing, so a stop, a block or a
--    future path that ends a pairing all behave the same.
--
-- can_see_full_watchlist is recreated from its only body (20260927100000);
-- the one change is is_profile_public -> can_view_profile.

-- ── 1. Full watchlist visibility ─────────────────────────────────────────────
create or replace function public.can_see_full_watchlist(p_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.not_blocked(p_other) and (
    public.can_view_profile(p_other)
    or exists (
      select 1 from public.watch_together w
       where w.status = 'accepted'
         and ((w.requester_id = p_other and w.recipient_id = auth.uid() and w.requester_shares_full)
           or (w.recipient_id = p_other and w.requester_id = auth.uid() and w.recipient_shares_full))
    )
  )
$$;
revoke all on function public.can_see_full_watchlist(uuid) from public, anon;

-- ── 2. Stopping removes shared list membership ───────────────────────────────
create or replace function public.remove_list_members_on_watch_together_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'accepted' then
    delete from public.user_custom_list_members m
     using public.user_custom_lists l
     where l.id = m.list_id
       and ((l.user_id = old.requester_id and m.user_id = old.recipient_id)
         or (l.user_id = old.recipient_id and m.user_id = old.requester_id));
  end if;
  return old;
end;
$$;
revoke all on function public.remove_list_members_on_watch_together_delete() from public, anon, authenticated;

drop trigger if exists on_watch_together_delete_remove_list_members on public.watch_together;
create trigger on_watch_together_delete_remove_list_members
  after delete on public.watch_together
  for each row execute function public.remove_list_members_on_watch_together_delete();

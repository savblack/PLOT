-- Fixes 20261004100000_watch_together_mutual_follow_share.sql, which set
-- watch_together.requester_shares_full. 20260927160000_watchlist_visibility.sql
-- had already dropped that column in favour of watchlist_viewers, so the
-- trigger raised on every acceptance between people who follow each other
-- (plpgsql only resolves NEW's fields when the line runs, so creating it and
-- the migration test both passed). Pairs who don't follow each other never
-- reached that line.
--
-- Sharing a watchlist is now a row in watchlist_viewers (owner, viewer), and
-- a "private" watchlist moves to "selected" when someone is added, the same
-- as share_watchlist_with. That function acts for auth.uid(), who here is the
-- person accepting, so the sender's row is written directly. AFTER the row
-- changes, because it writes to other tables rather than editing NEW.

create or replace function public.share_full_for_mutual_follows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
     and exists (select 1 from public.follows f
                  where f.follower_id = new.requester_id and f.following_id = new.recipient_id and f.status = 'accepted')
     and exists (select 1 from public.follows f
                  where f.follower_id = new.recipient_id and f.following_id = new.requester_id and f.status = 'accepted')
  then
    insert into public.watchlist_viewers (owner_id, viewer_id) values (new.requester_id, new.recipient_id)
      on conflict do nothing;
    if public.watchlist_visibility_of(new.requester_id) = 'private' then
      update public.profiles set watchlist_visibility = 'selected' where id = new.requester_id;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.share_full_for_mutual_follows() from public, anon, authenticated;

drop trigger if exists share_full_for_mutual_follows on public.watch_together;
create trigger share_full_for_mutual_follows
  after insert or update of status on public.watch_together
  for each row execute function public.share_full_for_mutual_follows();

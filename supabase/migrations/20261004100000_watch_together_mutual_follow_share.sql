-- Watch together: when a pairing starts between two people who follow each
-- other, the person who sent the request (or whose invite link was used)
-- shares their full watchlist too, matching the accept sheet, which starts
-- "Also share my full watchlist" on for the person accepting.
--
-- A BEFORE trigger on the row rather than a new body for
-- respond_watch_together_request / accept_watch_together_link: both write the
-- accepted row, so the trigger covers them and anything added later without
-- retyping either function. It only ever sets requester_shares_full to true,
-- and only as a row becomes accepted. Either person can turn their own
-- sharing off afterwards (Settings > Privacy > Watch together).
--
-- Mutual means both follows are accepted. Accepted follows are public, so
-- this reads nothing new.

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
    new.requester_shares_full := true;
  end if;
  return new;
end;
$$;

revoke all on function public.share_full_for_mutual_follows() from public, anon, authenticated;

drop trigger if exists share_full_for_mutual_follows on public.watch_together;
create trigger share_full_for_mutual_follows
  before insert or update of status on public.watch_together
  for each row execute function public.share_full_for_mutual_follows();

-- The shape of 20261004100000: a trigger function sets a column that an
-- earlier migration dropped. Postgres accepts it; it fails when it runs.
create or replace function public.share_full_for_mutual_follows()
returns trigger language plpgsql as $$
begin
  update public.watch_together set requester_shares_full = true where id = new.id;
  return new;
end $$;

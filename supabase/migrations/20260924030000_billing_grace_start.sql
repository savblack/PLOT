-- A renewal advances Stripe's period end even when its invoice is unpaid.
-- Measure grace from the first past_due event, never that unpaid period end.
alter table public.billing_customers add column past_due_since timestamptz;
update public.billing_customers
set past_due_since = least(updated_at, last_event_at, current_period_end, now())
where subscription_status = 'past_due';

create function public.track_billing_grace_start()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.subscription_status = 'past_due' then
    if tg_op = 'UPDATE' and old.subscription_status = 'past_due'
       and old.stripe_subscription_id is not distinct from new.stripe_subscription_id
       and old.past_due_since is not null then
      new.past_due_since := old.past_due_since;
    else
      new.past_due_since := least(coalesce(new.last_event_at, now()), now());
    end if;
  else
    new.past_due_since := null;
  end if;
  return new;
end;
$$;
revoke all on function public.track_billing_grace_start() from public, anon, authenticated;
create trigger billing_grace_start before insert or update on public.billing_customers
for each row execute function public.track_billing_grace_start();

-- Live production body read on 2026-09-24; retain existing active/trialing policy.
-- redefines: is_premium (bound past_due grace to first failed-renewal event)
create or replace function public.is_premium(p_user uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.billing_customers
    where user_id = coalesce(p_user, auth.uid())
      and subscription_status in ('active', 'trialing', 'past_due')
      and current_period_end > now() - interval '3 days'
      and (subscription_status <> 'past_due' or past_due_since > now() - interval '3 days')
  );
$$;

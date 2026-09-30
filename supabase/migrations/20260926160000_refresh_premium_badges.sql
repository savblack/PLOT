-- Keep the profiles.is_premium badge in step with is_premium() between Stripe
-- events.
--
-- apply_stripe_subscription_event (20260923100000) writes the badge as
-- public.is_premium(user) at the moment an event lands, so it agrees with the
-- access gates then. But is_premium() is time-dependent: past_due grace ends
-- three days after past_due_since (20260924030000), and any subscription ends
-- three days after current_period_end. Neither moment sends a Stripe event,
-- and stripe-webhook only handles checkout.session.completed and
-- customer.subscription.updated/deleted. So after a failed renewal the badge
-- kept saying Premium until Stripe's retries ran out and it finally sent the
-- cancellation, which can be weeks, while every gate already denied access.
--
-- Scope: only accounts with a billing_customers row, i.e. badges Stripe
-- manages. 20260707000000 backfilled is_premium = is_supporter, so a legacy
-- supporter can hold the badge with no billing row; recomputing them would
-- strip it. Their badge is not this job's business.
--
-- Only rows whose badge disagrees are written, so the profiles triggers
-- (profiles-changed, the marketing mirror) fire only on a real change.
-- protect_premium_flag() lets this through: pg_cron runs with no JWT claims,
-- the same path migrations take.

create or replace function public.refresh_premium_badges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer;
begin
  update public.profiles p
     set is_premium = public.is_premium(p.id)
    from public.billing_customers b
   where b.user_id = p.id
     and p.is_premium is distinct from public.is_premium(p.id);
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

-- It rewrites other people's billing flag, so no client may call it.
revoke all on function public.refresh_premium_badges() from public, anon, authenticated;
grant execute on function public.refresh_premium_badges() to service_role;

comment on function public.refresh_premium_badges() is
  'Recomputes profiles.is_premium from is_premium() for Stripe-managed accounts whose badge has drifted (grace or period end passed with no Stripe event). Returns rows changed. Run hourly by pg_cron.';

-- Hourly: grace is measured in days, so an hour of lag is invisible, and
-- billing_customers is tiny.
do $do$
begin
  -- db:migration-test runs on vanilla Postgres with no cron schema; skip out
  -- loud there, as 20260913230451 does, so the gate still tests the function.
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling refresh-premium-badges';
    return;
  end if;

  perform cron.unschedule('refresh-premium-badges')
    where exists (select 1 from cron.job where jobname = 'refresh-premium-badges');

  perform cron.schedule(
    'refresh-premium-badges',
    '17 * * * *',
    $cron$select public.refresh_premium_badges()$cron$
  );
end
$do$;

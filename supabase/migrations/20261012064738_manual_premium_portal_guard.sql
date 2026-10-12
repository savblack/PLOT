-- A manually granted Premium row can carry a placeholder customer ID and no
-- Stripe subscription. Keep its entitlement, but do not offer a portal link.
-- Live production body read on 2026-10-12; only the canManage predicate changes.
-- redefines: get_my_billing_status (require a Stripe subscription for portal access)
create or replace function public.get_my_billing_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'isPremium', public.is_premium(),
    'canManage', exists(
      select 1 from public.billing_customers
      where user_id = auth.uid()
        and left(stripe_customer_id, 4) = 'cus_'
        and stripe_subscription_id is not null
    ),
    'status', (select subscription_status from public.billing_customers where user_id=auth.uid()),
    'cancelAtPeriodEnd', coalesce((select cancel_at_period_end from public.billing_customers where user_id=auth.uid()),false),
    'periodEnd', (select current_period_end from public.billing_customers where user_id=auth.uid())
  );
$$;

-- Commit the subscription, cosmetic badge and receipt together. A failed write
-- leaves no receipt, so Stripe retries cannot acknowledge an unfinished update.
-- Only the signature-verified edge handler (service_role) can invoke this RPC.
create function public.apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created timestamptz,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_price_id text,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_previous public.billing_customers%rowtype;
  v_inserted integer;
begin
  if nullif(p_event_id, '') is null or p_event_created is null
     or p_user_id is null or nullif(p_customer_id, '') is null
     or nullif(p_subscription_id, '') is null then
    raise exception 'Missing billing event linkage';
  end if;

  -- Serialize even the first purchase, before a billing row exists. The lock
  -- lives until transaction end; concurrent deliveries cannot race the guard.
  perform pg_advisory_xact_lock(hashtextextended('stripe:' || p_user_id::text, 0));
  insert into public.stripe_events(id, type) values(p_event_id, p_event_type)
    on conflict(id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('duplicate', true); end if;

  select * into v_previous from public.billing_customers where user_id = p_user_id for update;
  if v_previous.last_event_at > p_event_created then
    return jsonb_build_object('stale', true);
  end if;
  -- An old subscription's late deletion must not cancel a replacement.
  if p_status = 'canceled' and v_previous.stripe_subscription_id is not null
     and v_previous.stripe_subscription_id <> p_subscription_id then
    return jsonb_build_object('stale', true);
  end if;
  if v_previous.stripe_customer_id is not null
     and v_previous.stripe_customer_id <> p_customer_id then
    raise exception 'Stripe customer does not match billing account';
  end if;

  insert into public.billing_customers(
    user_id, stripe_customer_id, stripe_subscription_id, subscription_status,
    price_id, cancel_at_period_end, current_period_end, last_event_at, updated_at
  ) values (
    p_user_id, p_customer_id, p_subscription_id, p_status,
    p_price_id, p_cancel_at_period_end, p_current_period_end, p_event_created, now()
  ) on conflict(user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    subscription_status = excluded.subscription_status,
    price_id = excluded.price_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_end = excluded.current_period_end,
    last_event_at = excluded.last_event_at,
    updated_at = excluded.updated_at;

  -- Use the same policy as every access gate, including its grace period.
  update public.profiles set is_premium = public.is_premium(p_user_id) where id = p_user_id;
  if not found then raise exception 'Billing profile is missing'; end if;
  return jsonb_build_object('applied', true);
end;
$$;
revoke all on function public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz) to service_role;

-- Self-only status exposes no Stripe identifiers. Expired subscribers still
-- need a path to the portal to repair payment or cancel their subscription.
create function public.get_my_billing_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'isPremium', public.is_premium(),
    'canManage', exists(select 1 from public.billing_customers where user_id=auth.uid()),
    'status', (select subscription_status from public.billing_customers where user_id=auth.uid()),
    'cancelAtPeriodEnd', coalesce((select cancel_at_period_end from public.billing_customers where user_id=auth.uid()),false),
    'periodEnd', (select current_period_end from public.billing_customers where user_id=auth.uid())
  );
$$;
revoke all on function public.get_my_billing_status() from public, anon;
grant execute on function public.get_my_billing_status() to authenticated;

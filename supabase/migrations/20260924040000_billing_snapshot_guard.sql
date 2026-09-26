-- Recovered 2026-09-25 from production's supabase_migrations.schema_migrations.
-- This migration was applied to production (and Staging) without ever being
-- committed, which blocked every later deploy with "Remote migration versions
-- not found in local migrations directory". The SQL below is the recorded
-- statements, verbatim. It is already applied and will not run again.

-- A Stripe snapshot must be fetched AFTER reading this account's revision.
-- If another delivery commits meanwhile, the handler refetches both and retries.
alter table public.billing_customers add column revision bigint not null default 0;

create function public.apply_stripe_subscription_snapshot(
  p_expected_revision bigint,
  p_event_id text, p_event_type text, p_event_created timestamptz,
  p_user_id uuid, p_customer_id text, p_subscription_id text, p_status text,
  p_price_id text, p_cancel_at_period_end boolean, p_current_period_end timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_revision bigint; v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('stripe:' || p_user_id::text, 0));
  select revision into v_revision from public.billing_customers where user_id=p_user_id for update;
  if v_revision is distinct from p_expected_revision then
    return jsonb_build_object('retry', true);
  end if;
  v_result := public.apply_stripe_subscription_event(
    p_event_id, p_event_type, p_event_created, p_user_id, p_customer_id,
    p_subscription_id, p_status, p_price_id, p_cancel_at_period_end, p_current_period_end
  );
  if v_result->>'applied' = 'true' then
    update public.billing_customers set revision=revision+1 where user_id=p_user_id;
  end if;
  return v_result;
end;
$$;
revoke all on function public.apply_stripe_subscription_snapshot(bigint,text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_snapshot(bigint,text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz) to service_role;

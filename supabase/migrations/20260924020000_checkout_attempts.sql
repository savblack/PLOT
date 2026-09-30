-- Durable first-purchase coordination. Clients cannot read or grant billing access.
create table public.billing_checkout_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  operation_id uuid not null default gen_random_uuid(),
  price_id text not null,
  settings_url text not null,
  session_id text,
  started_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz
);
alter table public.billing_checkout_attempts enable row level security;
revoke all on public.billing_checkout_attempts from public, anon, authenticated;
grant all on public.billing_checkout_attempts to service_role;

create function public.claim_billing_checkout(p_user_id uuid, p_price_id text, p_settings_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.billing_checkout_attempts%rowtype;
begin
  insert into public.billing_checkout_attempts(user_id,price_id,settings_url)
  values(p_user_id,p_price_id,p_settings_url) on conflict(user_id) do nothing;
  select * into v_row from public.billing_checkout_attempts where user_id=p_user_id for update;
  if v_row.lease_until > now() then return null; end if;
  update public.billing_checkout_attempts set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  where user_id=p_user_id returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke all on function public.claim_billing_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_billing_checkout(uuid,text,text) to service_role;

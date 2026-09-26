-- Deploy with checkout closed, followed by the matching stripe-billing function.
-- Preserve old idempotency parameters; new operations use Managed Payments.
alter table public.billing_checkout_attempts
  add column managed_payments boolean not null default false;
alter table public.billing_checkout_attempts
  alter column managed_payments set default true;
-- claim_billing_checkout returns to_jsonb(table%rowtype), including this column.

-- protect_premium_flag() dies on a recycled pooled backend.
--
-- The function starts:
--
--   v_claims text := current_setting('request.jwt.claims', true);
--   v_is_client := v_claims is not null
--                  and coalesce(v_claims::jsonb->>'role', '') <> 'service_role';
--
-- `request.jwt.claims` is an unregistered custom GUC, and `DISCARD ALL` — which
-- the session pooler issues between clients — resets those to the EMPTY STRING
-- rather than unsetting them. So any backend that has ever served an
-- authenticated request carries `request.jwt.claims = ''` afterwards. That value
-- is not null, so it sails through the guard, and then `''::jsonb` raises:
--
--   ERROR:  invalid input syntax for type json
--   DETAIL:  The input string ended unexpectedly.
--   CONTEXT: PL/pgSQL function protect_premium_flag() line 8 at assignment
--
-- Every UPDATE on public.profiles fires this trigger, so on that backend every
-- profile write fails — including from a migration. It is intermittent by
-- nature: it depends entirely on which pooled backend you land on, which is why
-- it has sat here unnoticed since 20260708000000. Found on 2026-09-13 when the
-- Staging block test hit it twice in a row and passed on the third attempt.
--
-- The app is not affected: PostgREST sets the GUC per request from a verified
-- JWT, so a real client always has parseable claims. The victims are direct SQL
-- sessions through the pooler — migrations, the dashboard, and scripts.
--
-- The fix separates two cases the original conflated:
--
--   ''  is ABSENT, not malformed. It means exactly what null means here — no
--       JWT, therefore direct SQL — so it takes the same path null already did.
--       Treating it as a client instead would swap a crash for a different
--       intermittent failure, since a migration legitimately updating is_premium
--       would then be rejected depending on which backend it got.
--
--   Non-empty and unparseable is not something any real caller produces, so it
--       fails CLOSED: treated as a client, and the billing columns stay locked.
--
-- Behaviour is otherwise byte-identical; `npm run db:function-diff` shows the
-- declare block and the guard changing and nothing else.
--
-- redefines: protect_premium_flag (no ON CONFLICT target; it upserts nothing)

create or replace function public.protect_premium_flag()
returns trigger language plpgsql as $$
declare
  v_raw text := current_setting('request.jwt.claims', true);
  v_claims jsonb;
begin
  -- No claims at all: direct SQL (dashboard, migrations, psql), or a pooled
  -- backend that DISCARD ALL left holding an empty string. Same thing.
  if coalesce(btrim(v_raw), '') = '' then
    return new;
  end if;

  begin
    v_claims := v_raw::jsonb;
  exception when others then
    -- Non-empty and not JSON. Nothing legitimate does this, so fail closed:
    -- an empty object has no 'role', so the checks below all apply.
    v_claims := '{}'::jsonb;
  end;

  -- The service role is the Ko-fi webhook and the billing edge functions.
  if coalesce(v_claims->>'role', '') = 'service_role' then
    return new;
  end if;

  if new.is_premium is distinct from old.is_premium then
    raise exception 'is_premium can only be changed by billing';
  end if;

  if new.is_supporter is distinct from old.is_supporter then
    raise exception 'is_supporter can only be changed by the Ko-fi webhook';
  end if;

  if new.last_kofi_tip_at is distinct from old.last_kofi_tip_at then
    raise exception 'last_kofi_tip_at can only be changed by the Ko-fi webhook';
  end if;

  return new;
end;
$$;

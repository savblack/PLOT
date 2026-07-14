-- notify-signup — SQL fallback wiring
--
-- Use this ONLY if the Supabase dashboard's Database Webhooks UI does not let
-- you pick the `auth` schema / `auth.users` table. It does the same job a
-- dashboard webhook would: an AFTER INSERT trigger on auth.users that POSTs the
-- new row to the notify-signup edge function via pg_net.
--
-- ⚠️  Do NOT use this AND a dashboard webhook — you'd get two emails per signup.
-- ⚠️  This is deliberately NOT in supabase/migrations/ so it never auto-applies.
--     Paste it into the Supabase SQL editor by hand when you need it.
--
-- ── One-time setup ──────────────────────────────────────────────────────────
-- The edge function deploys with verify_jwt = true, so the POST must carry a
-- valid JWT. Store the project service-role key in Vault once (SQL editor):
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'notify_signup_service_role_key');
--
-- Until that secret exists the POST goes out with an empty bearer and the
-- gateway rejects it (401) — notifications fail closed, they don't leak.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_role_key text;
begin
  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'notify_signup_service_role_key'
  limit 1;

  perform net.http_post(
    url := 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1/notify-signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(service_role_key, '')
    ),
    body := jsonb_build_object('record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_new_signup on auth.users;
create trigger trg_notify_new_signup
  after insert on auth.users
  for each row execute function public.notify_new_signup();

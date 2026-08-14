-- Take the live service_role JWT out of the schema.
--
-- `supabase_functions.http_request` accepts the Authorization header as a
-- literal trigger argument, so the two database webhooks stored a full-privilege
-- service_role key (valid until 2036) directly in their trigger definitions.
-- That key was therefore inside every `pg_dump`, every nightly backup artifact,
-- and any `pg_restore -l` or schema diff — anywhere the schema went, the
-- credential went with it. Found 2026-08-14 while restore-testing the backup.
--
-- Replacement reads both the bearer and the project base URL from Vault, so the
-- trigger DDL carries only a function slug. Rotating the key becomes a Vault
-- update instead of a schema migration, and the same DDL is correct on
-- Production and Staging.
--
-- PREREQUISITE — create these two Vault secrets BEFORE this migration runs, or
-- the guard below aborts it:
--   select vault.create_secret('<service_role key>', 'edge_webhook_bearer', '...');
--   select vault.create_secret('https://<ref>.supabase.co', 'edge_webhook_base_url', '...');

-- Fail at deploy time rather than wiring up triggers that would silently skip
-- every webhook. A red Supabase check is recoverable; months of quietly missing
-- feedback notifications and Brevo syncs are not.
do $guard$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'edge_webhook_bearer') then
    raise exception 'Vault secret edge_webhook_bearer is missing — create it before applying this migration (see the header)';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'edge_webhook_base_url') then
    raise exception 'Vault secret edge_webhook_base_url is missing — create it before applying this migration (see the header)';
  end if;
end
$guard$;

-- pg_net is already present on Production; this makes the migration self
-- sufficient on a restored database or on Staging.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_edge_function() returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bearer   text;
  base_url text;
begin
  select decrypted_secret into bearer
    from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_webhook_base_url';

  -- Deliberately do NOT raise. These triggers sit on user-facing writes
  -- (feedback submission, profile updates); aborting the transaction would turn
  -- a missing operational secret into a broken product. The guard above is what
  -- catches misconfiguration, at deploy time.
  if bearer is null or base_url is null then
    raise warning 'notify_edge_function: vault secrets missing (bearer=%, base_url=%); skipping webhook for %.%',
      bearer is not null, base_url is not null, tg_table_schema, tg_table_name;
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/' || tg_argv[0],
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    -- Must match supabase_functions.http_request's payload exactly. The
    -- handlers read body.record, and profiles-changed also reads body.old_record;
    -- a mismatch makes them answer 400 "No record in payload" and the webhook
    -- fails silently from the database's point of view.
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      'old_record', case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end
    ),
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$fn$;

comment on function public.notify_edge_function() is
  'Calls an Edge Function from a trigger. Bearer and base URL come from Vault so no credential lands in the schema. tg_argv[0] is the function slug.';

-- Names preserved so existing docs and any operator muscle memory still match.
drop trigger if exists on_feedback_insert on public.feedback;
create trigger on_feedback_insert
  after insert on public.feedback
  for each row execute function public.notify_edge_function('notify-feedback');

drop trigger if exists "profiles-changed-brevo-sync" on public.profiles;
create trigger "profiles-changed-brevo-sync"
  after insert or update on public.profiles
  for each row execute function public.notify_edge_function('profiles-changed');

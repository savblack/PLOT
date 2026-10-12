-- Push is an opt-in Premium delivery channel for existing in-app notifications.
-- A notification row stays the source of truth. No existing rows are changed.

alter table public.notification_preferences
  add column if not exists push_enabled boolean not null default false;
alter table public.notification_preferences
  add column if not exists push_enabled_at timestamptz;

create or replace function public.enforce_push_premium() returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.push_enabled is true
     and (tg_op = 'INSERT' or old.push_enabled is distinct from true)
     and not public.is_premium(new.user_id) then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.push_enabled is distinct from old.push_enabled then
    new.push_enabled_at := case when new.push_enabled then now() else null end;
  end if;
  return new;
end;
$fn$;

drop trigger if exists notification_preferences_push_premium on public.notification_preferences;
create trigger notification_preferences_push_premium
  before insert or update on public.notification_preferences
  for each row execute function public.enforce_push_premium();

create table if not exists public.push_tokens (
  token text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  primary key (token)
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id)
  where disabled_at is null;

alter table public.push_tokens enable row level security;
create policy "own push tokens readable" on public.push_tokens
  for select to authenticated using (auth.uid() = user_id);
create policy "own push tokens deletable" on public.push_tokens
  for delete to authenticated using (auth.uid() = user_id);
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;

-- A device may switch accounts without receiving a new Expo token. The token
-- itself is an unguessable bearer; registering it moves that device to the
-- current account so the previous account cannot keep sending to it.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$'
     or p_platform not in ('ios', 'android') then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, current_user_id, p_platform)
  on conflict (token) do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    last_seen_at = now(),
    disabled_at = null;
end;
$fn$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- One row per notification and device. This avoids duplicate sends to devices
-- already accepted when another device's delivery needs a retry.
create table if not exists public.push_deliveries (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  token text not null references public.push_tokens (token) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'disabled')),
  attempts integer not null default 0,
  provider_ref text,
  error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  receipted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (notification_id, token)
);
create index if not exists push_deliveries_open_idx
  on public.push_deliveries (status, claimed_at)
  where status in ('pending', 'failed', 'sent');
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;

-- Poll for new title rows and their Expo receipts. Both handlers require the
-- exact service-role bearer; send-push also requires PUSH_DELIVER_ENABLED=true.
create or replace function public.run_push_job(p_name text) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  bearer text;
  base_url text;
begin
  if p_name not in ('send-push', 'push-receipts') then
    raise exception 'invalid_push_job';
  end if;
  select decrypted_secret into bearer from vault.decrypted_secrets where name = 'edge_webhook_bearer';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'edge_webhook_base_url';
  if bearer is null or base_url is null then
    raise warning 'run_push_job: vault secrets missing; skipping';
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || bearer),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$fn$;
revoke execute on function public.run_push_job(text) from public, anon, authenticated;

create extension if not exists pg_cron;
do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped scheduling push jobs';
    return;
  end if;
  perform cron.unschedule('send-push')
    where exists (select 1 from cron.job where jobname = 'send-push');
  perform cron.unschedule('push-receipts')
    where exists (select 1 from cron.job where jobname = 'push-receipts');
  perform cron.schedule('send-push', '*/15 * * * *', $cron$select public.run_push_job('send-push')$cron$);
  perform cron.schedule('push-receipts', '7,22,37,52 * * * *', $cron$select public.run_push_job('push-receipts')$cron$);
end
$do$;

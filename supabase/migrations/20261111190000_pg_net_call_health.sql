-- Record whether the database's own HTTP calls (pg_net) to edge functions
-- worked, and let the read-only CI role see a summary per function.
--
-- WHY: most pg_cron jobs, and the database webhooks on feedback, reports and
-- profiles, hand their work to an edge function with net.http_post. pg_cron
-- records that hand-off as a success the moment the request is queued, so a
-- function that answers 404 (not deployed), 500 or never answers looks healthy
-- to cron-health.yml. On Staging on 2026-11-11 brevo-lifecycle and
-- marketing-notion-mirror had answered 404 on every run, and nothing said so.
--
-- WHY A LOG TABLE: pg_net keeps each answer in net._http_response for 6 hours,
-- but that row has no URL, so it cannot say which function it came from. The
-- URL is only in net.http_request_queue, and pg_net deletes the row once the
-- call is sent. So two AFTER INSERT triggers copy what is needed into
-- public.pg_net_calls: the function name when a call is queued, and the
-- status when the answer lands. Nothing else is copied: no headers (they carry
-- the bearer secret), no body, no answer text.
--
-- The triggers sit on pg_net's own tables, inside every caller's transaction,
-- including user-facing writes to profiles and feedback. So each trigger
-- swallows every error: a broken logger must never break a save or a send. If
-- a pg_net upgrade ever drops the triggers, pg_net_call_health() raises, and
-- the hourly check reports that it could not run rather than going quiet.
-- Only Supabase can drop these triggers once created; see the trigger block
-- below for how Plot switches them off.
--
-- Read by .github/workflows/cron-health.yml as plot_ci_readonly through
-- public.pg_net_call_health(), which returns function names, counts, times and
-- outcomes only. Execute goes to plot_ci_readonly alone.
--
-- Rows older than 8 days are removed daily by the pg-net-calls-purge job.

create table if not exists public.pg_net_calls (
  request_id  bigint primary key,           -- net.http_request_queue.id = net._http_response.id
  target      text not null,                -- edge function name, or the host for any other URL
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  status_code integer,
  timed_out   boolean,
  errored     boolean                       -- pg_net reported an error (no connection, DNS, ...)
);

create index if not exists pg_net_calls_target_created_idx
  on public.pg_net_calls (target, created_at desc);

comment on table public.pg_net_calls is
  'One row per pg_net HTTP call: the edge function it went to and how it was answered. No headers, bodies or answer text. Written by triggers on net.http_request_queue and net._http_response; read through pg_net_call_health().';

-- Not for the API: no policies, and Supabase's default grants are taken back.
alter table public.pg_net_calls enable row level security;
revoke all on table public.pg_net_calls from public, anon, authenticated, service_role;

create or replace function public.pg_net_calls_log_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.pg_net_calls (request_id, target)
    values (
      new.id,
      coalesce(
        substring(new.url from '/functions/v1/([A-Za-z0-9_-]+)'),
        substring(new.url from '^[a-z]+://([^/:?#]+)'),
        'unknown'
      )
    )
    on conflict (request_id) do nothing;
  exception when others then
    raise warning 'pg_net_calls_log_request: % (call not logged)', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.pg_net_calls_log_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    update public.pg_net_calls
       set answered_at = new.created,
           status_code = new.status_code,
           timed_out   = coalesce(new.timed_out, false),
           errored     = new.error_msg is not null
     where request_id = new.id;
  exception when others then
    raise warning 'pg_net_calls_log_response: % (answer not logged)', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.pg_net_calls_log_request() from public, anon, authenticated, service_role;
revoke all on function public.pg_net_calls_log_response() from public, anon, authenticated, service_role;

-- The migration-test sandbox stubs pg_net without these tables, so the
-- triggers are created only where pg_net really exists.
do $do$
begin
  if to_regclass('net.http_request_queue') is null or to_regclass('net._http_response') is null then
    raise notice '[sandbox] no pg_net tables: skipped the pg_net_calls triggers';
    return;
  end if;

  -- No `drop trigger`: pg_net's tables belong to supabase_admin, and postgres
  -- holds TRIGGER on them, which lets it create a trigger but not drop or
  -- disable one (that needs ownership). So these triggers can be removed only
  -- by Supabase. Plot's off switch is the trigger functions above, which
  -- postgres owns: recreate both as `begin return null; end;` and nothing is
  -- logged.
  if not exists (select 1 from pg_trigger where tgname = 'pg_net_calls_log_request'
                   and tgrelid = 'net.http_request_queue'::regclass) then
    execute 'create trigger pg_net_calls_log_request after insert on net.http_request_queue
             for each row execute function public.pg_net_calls_log_request()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'pg_net_calls_log_response'
                   and tgrelid = 'net._http_response'::regclass) then
    execute 'create trigger pg_net_calls_log_response after insert on net._http_response
             for each row execute function public.pg_net_calls_log_response()';
  end if;
end
$do$;

-- One row per function called in the last 8 days.
--
-- A call is settled once it has an answer, or once it has waited 15 minutes
-- without one (pg_net's longest timeout in Plot is 150 seconds, so by then
-- the answer is lost: pg_net restarted, or its worker stopped).
-- A settled call is ok when it was answered 2xx in time; anything else failed.
--
--   failures_since_ok  settled failures since the function's last ok answer
--                      (all of them, if it has had none in the 8 days)
--   last_outcome       'ok', 'http 404', 'timed out', 'no answer', 'error'
create or replace function public.pg_net_call_health()
returns table (
  target text,
  calls_last_day integer,
  failed_last_day integer,
  failures_since_ok integer,
  last_called_at timestamptz,
  last_outcome text,
  last_failed_at timestamptz,
  last_ok_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from pg_catalog.pg_trigger t
       where t.tgname in ('pg_net_calls_log_request', 'pg_net_calls_log_response')
         and t.tgenabled <> 'D') < 2 then
    raise exception 'pg_net_calls logger triggers are missing or disabled'
      using hint = 'Re-run the trigger block of 20261111190000_pg_net_call_health.sql.';
  end if;

  return query
  with settled as (
    select c.target, c.created_at,
           case
             when c.answered_at is null then 'no answer'
             when c.timed_out then 'timed out'
             when c.status_code is null and c.errored then 'error'
             when c.status_code is null then 'no answer'
             when c.status_code between 200 and 299 then 'ok'
             else 'http ' || c.status_code
           end as outcome
      from public.pg_net_calls c
     where c.created_at > now() - interval '8 days'
       and (c.answered_at is not null or c.created_at < now() - interval '15 minutes')
  ),
  per_target as (
    select s.target,
           max(s.created_at) filter (where s.outcome = 'ok')  as last_ok_at,
           max(s.created_at) filter (where s.outcome <> 'ok') as last_failed_at,
           max(s.created_at)                                  as last_called_at,
           count(*) filter (where s.created_at > now() - interval '1 day')                      as calls_last_day,
           count(*) filter (where s.created_at > now() - interval '1 day' and s.outcome <> 'ok') as failed_last_day
      from settled s
     group by s.target
  )
  select p.target,
         p.calls_last_day::integer,
         p.failed_last_day::integer,
         (select count(*) from settled s
           where s.target = p.target and s.outcome <> 'ok'
             and (p.last_ok_at is null or s.created_at > p.last_ok_at))::integer,
         p.last_called_at,
         (select s.outcome from settled s
           where s.target = p.target order by s.created_at desc limit 1),
         p.last_failed_at,
         p.last_ok_at
    from per_target p
   order by p.target;
end;
$$;

revoke all on function public.pg_net_call_health() from public, anon, authenticated, service_role;

do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'plot_ci_readonly') then
    execute 'grant execute on function public.pg_net_call_health() to plot_ci_readonly';
  else
    raise notice 'plot_ci_readonly does not exist: pg_net_call_health() created with no caller';
  end if;
end
$do$;

comment on function public.pg_net_call_health() is
  'One row per edge function the database called through pg_net in the last 8 days: calls and failures in the last day, failures since the last ok answer, latest outcome. No URLs, headers or answer text. Read by .github/workflows/cron-health.yml as plot_ci_readonly.';

-- Daily purge, after cron-history-purge at 03:53.
do $do$
begin
  if to_regnamespace('cron') is null then
    raise notice '[sandbox] no cron schema: skipped pg-net-calls-purge';
    return;
  end if;
  perform cron.schedule(
    'pg-net-calls-purge',
    '58 3 * * *',
    $job$delete from public.pg_net_calls where created_at < now() - interval '8 days'$job$
  );
end
$do$;

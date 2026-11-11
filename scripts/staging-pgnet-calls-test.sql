-- pg_net call logging (20261111190000_pg_net_call_health.sql).
--
-- The triggers sit on pg_net's own tables, inside every caller's transaction,
-- including user-facing writes. So this proves both halves: a call and its
-- answer are recorded and summarised correctly, AND a broken logger never
-- breaks the call it is logging. pg_net's worker cannot see this uncommitted
-- transaction, so answers are written to net._http_response by hand, the way
-- the worker writes them.
\set ON_ERROR_STOP on
begin;

-- Start from an empty log so counts are exact.
delete from public.pg_net_calls;

do $$
declare
  base text := 'https://staging-test.invalid/functions/v1/';
  ok_id bigint; fail_a bigint; fail_b bigint; lost_id bigint; other_id bigint;
  r record;
begin
  -- 1. A queued call records its function name, never the URL's query or headers.
  insert into net.http_request_queue (method, url, headers, timeout_milliseconds)
    values ('POST', base || 'pgnet-test-busy?secret=x', '{"Authorization":"Bearer x"}', 1000) returning id into ok_id;
  insert into net.http_request_queue (method, url, headers, timeout_milliseconds)
    values ('POST', base || 'pgnet-test-busy', '{}', 1000) returning id into fail_a;
  insert into net.http_request_queue (method, url, headers, timeout_milliseconds)
    values ('POST', base || 'pgnet-test-busy', '{}', 1000) returning id into fail_b;
  insert into net.http_request_queue (method, url, headers, timeout_milliseconds)
    values ('POST', base || 'pgnet-test-lost', '{}', 1000) returning id into lost_id;
  insert into net.http_request_queue (method, url, headers, timeout_milliseconds)
    values ('POST', 'https://hooks.example.invalid:8443/x?y=1', '{}', 1000) returning id into other_id;

  if (select target from public.pg_net_calls where request_id = ok_id) <> 'pgnet-test-busy'
     or (select target from public.pg_net_calls where request_id = other_id) <> 'hooks.example.invalid' then
    raise exception 'FAIL targets not derived from the URL: %',
      (select json_agg(t) from public.pg_net_calls t);
  end if;
  raise notice 'PASS queued calls record the function name (or bare host), nothing else';

  -- Calls are made "now" in this transaction; age them so they count as settled.
  update public.pg_net_calls set created_at = now() - interval '30 minutes' where request_id = ok_id;
  update public.pg_net_calls set created_at = now() - interval '20 minutes' where request_id = fail_a;
  update public.pg_net_calls set created_at = now() - interval '10 minutes' where request_id = fail_b;
  update public.pg_net_calls set created_at = now() - interval '40 minutes' where request_id = lost_id;

  -- 2. Answers land: 200, then 500, then a timeout. The lost call never gets one.
  insert into net._http_response (id, status_code, timed_out) values (ok_id, 200, false);
  insert into net._http_response (id, status_code, timed_out) values (fail_a, 500, false);
  insert into net._http_response (id, status_code, timed_out, error_msg) values (fail_b, null, true, 'Timeout was reached');

  select * into r from public.pg_net_calls where request_id = fail_b;
  if r.answered_at is null or not r.timed_out then
    raise exception 'FAIL answer not recorded: %', row_to_json(r);
  end if;
  raise notice 'PASS answers are recorded against the call that made them';

  -- 3. The summary.
  select * into r from public.pg_net_call_health() h where h.target = 'pgnet-test-busy';
  if r.calls_last_day <> 3 or r.failed_last_day <> 2 or r.failures_since_ok <> 2
     or r.last_outcome <> 'timed out' or r.last_ok_at is null then
    raise exception 'FAIL busy target summary wrong: %', row_to_json(r);
  end if;
  select * into r from public.pg_net_call_health() h where h.target = 'pgnet-test-lost';
  if r.last_outcome <> 'no answer' or r.failures_since_ok <> 1 or r.last_ok_at is not null then
    raise exception 'FAIL unanswered call not counted as a failure: %', row_to_json(r);
  end if;
  -- other_id is still "now" and unanswered: not settled, so not judged yet.
  if exists (select 1 from public.pg_net_call_health() h where h.target = 'hooks.example.invalid') then
    raise exception 'FAIL a call still in flight was judged';
  end if;
  raise notice 'PASS summary: failures since last OK, timeouts, lost calls; in-flight calls not judged';

  -- 4. Only the read-only CI role may call it, and nobody reads the table.
  if not has_function_privilege('plot_ci_readonly', 'public.pg_net_call_health()', 'execute')
     or has_function_privilege('anon', 'public.pg_net_call_health()', 'execute')
     or has_function_privilege('authenticated', 'public.pg_net_call_health()', 'execute')
     or has_function_privilege('service_role', 'public.pg_net_call_health()', 'execute')
     or has_table_privilege('anon', 'public.pg_net_calls', 'select')
     or has_table_privilege('authenticated', 'public.pg_net_calls', 'select')
     or has_table_privilege('plot_ci_readonly', 'public.pg_net_calls', 'select') then
    raise exception 'FAIL grants are wrong';
  end if;
  raise notice 'PASS only plot_ci_readonly can read the summary; the table is closed';
end $$;

-- 5. A broken logger must not break the call. Break it, then call pg_net the
--    way every cron job and webhook does.
alter table public.pg_net_calls rename to pg_net_calls_broken;
do $$
declare id bigint;
begin
  select net.http_post(url := 'https://staging-test.invalid/functions/v1/pgnet-test-broken',
                       body := '{}'::jsonb, timeout_milliseconds := 1000) into id;
  if id is null then raise exception 'FAIL net.http_post returned nothing'; end if;
  insert into net._http_response (id, status_code, timed_out) values (id, 200, false);
  raise notice 'PASS net.http_post and the answer still land when the logger is broken';
end $$;
alter table public.pg_net_calls_broken rename to pg_net_calls;

-- 6. Both triggers are in place and enabled. (postgres cannot disable them to
--    prove the summary's refusal directly: that needs table ownership, which
--    supabase_admin keeps. The refusal is the guard at the top of
--    pg_net_call_health().)
do $$
begin
  if (select count(*) from pg_trigger
       where tgname in ('pg_net_calls_log_request', 'pg_net_calls_log_response')
         and tgenabled <> 'D') <> 2 then
    raise exception 'FAIL logging triggers missing or disabled';
  end if;
  if (select prosrc from pg_proc where oid = 'public.pg_net_call_health()'::regprocedure)
       not like '%logger triggers are missing%' then
    raise exception 'FAIL pg_net_call_health() lost its missing-logger guard';
  end if;
  raise notice 'PASS both logging triggers enabled; summary guards against their absence';
end $$;

rollback;

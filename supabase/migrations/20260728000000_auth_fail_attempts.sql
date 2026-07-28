-- Distributed brute-force throttle, shared by admin-review's login and
-- media-sync's companion-token auth (previously each kept its own in-memory
-- Map inside the edge function, which reset whenever the Deno isolate cycled
-- and didn't hold up against requests spread across isolates). `scope` keeps
-- the two counters independent per IP. Only the service_role (which bypasses
-- RLS) touches this table.
create table if not exists public.auth_fail_attempts (
  scope text not null,
  ip text not null,
  fail_count integer not null default 0,
  window_start timestamptz not null default now(),
  primary key (scope, ip)
);

alter table public.auth_fail_attempts enable row level security;

-- Atomically increments (or resets, if the window has elapsed) the fail count
-- for a (scope, ip) and returns the post-increment count. Single statement so
-- concurrent requests from the same IP can't race past each other.
create or replace function public.auth_note_fail(p_scope text, p_ip text, p_window_ms bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.auth_fail_attempts (scope, ip, fail_count, window_start)
  values (p_scope, p_ip, 1, now())
  on conflict (scope, ip) do update
    set fail_count = case
          when now() - auth_fail_attempts.window_start > (p_window_ms::text || ' milliseconds')::interval
            then 1
          else auth_fail_attempts.fail_count + 1
        end,
        window_start = case
          when now() - auth_fail_attempts.window_start > (p_window_ms::text || ' milliseconds')::interval
            then now()
          else auth_fail_attempts.window_start
        end
  returning fail_count into v_count;
  return v_count;
end;
$$;

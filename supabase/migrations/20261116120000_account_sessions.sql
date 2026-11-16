-- A session is a signed-in visible/foreground open, shared across web and phone.
-- A null last_session_at records session 1; otherwise 30 minutes since the
-- last qualifying open OR a new date in the viewer's local timezone increments.
-- Existing profiles start at 1 with a fresh timestamp, so rollout itself
-- cannot make every established Free account eligible for a trial prompt.
alter table public.profiles
  add column session_count integer not null default 0 check (session_count >= 0),
  add column last_session_at timestamptz;

update public.profiles set session_count = 1, last_session_at = now();

create function public.record_account_session(p_timezone text default 'UTC')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_timezone text := 'UTC';
  v_count integer;
  v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    v_timezone := p_timezone;
  end if;
  select session_count, last_session_at into v_count, v_last
    from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_last is null or v_now - v_last >= interval '30 minutes'
    or (v_last at time zone v_timezone)::date <> (v_now at time zone v_timezone)::date then
    v_count := v_count + 1;
    update public.profiles set session_count = v_count, last_session_at = v_now where id = auth.uid();
  end if;
  return v_count;
end;
$$;

revoke all on function public.record_account_session(text) from public;
grant execute on function public.record_account_session(text) to authenticated;

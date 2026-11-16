-- A session is a signed-in visible/foreground open, shared across web and phone.
-- A null last_session_at records session 1; otherwise 30 minutes since the
-- last qualifying open OR a new date in the viewer's local timezone increments.
-- Existing profiles start at 1 with a fresh timestamp. Their deferred prompt
-- marker stays null, so rollout cannot create a natural-moment offer.
alter table public.profiles add column if not exists session_count integer;
alter table public.profiles add column if not exists last_session_at timestamptz;
alter table public.profiles add column if not exists premium_trial_prompt_deferred_at timestamptz;

update public.profiles set session_count = 1, last_session_at = now()
  where session_count is null;

alter table public.profiles alter column session_count set default 0;
-- contracts: profiles.session_count (new column is backfilled and has a default before this constraint; older inserts can omit it)
alter table public.profiles alter column session_count set not null;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.profiles'::regclass and conname = 'profiles_session_count_check'
  ) then
    alter table public.profiles add constraint profiles_session_count_check check (session_count >= 0);
  end if;
end;
$$;

create or replace function public.record_account_session(p_timezone text default 'UTC')
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

-- Only an explicit suppressed onboarding or Trakt offer creates this marker.
-- Existing profiles stay null. Claiming is atomic across devices.
create or replace function public.set_premium_trial_prompt_deferral(p_user_id uuid, p_deferred boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_updated boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user_id is distinct from auth.uid() then raise exception 'account_mismatch'; end if;
  if p_deferred is null then raise exception 'invalid_deferral'; end if;
  if p_deferred then
    update public.profiles
      set premium_trial_prompt_deferred_at = coalesce(premium_trial_prompt_deferred_at, now())
      where id = auth.uid();
  else
    update public.profiles set premium_trial_prompt_deferred_at = null
      where id = auth.uid() and premium_trial_prompt_deferred_at is not null;
  end if;
  v_updated := found;
  return v_updated;
end;
$$;

revoke all on function public.set_premium_trial_prompt_deferral(uuid, boolean) from public;
grant execute on function public.set_premium_trial_prompt_deferral(uuid, boolean) to authenticated;

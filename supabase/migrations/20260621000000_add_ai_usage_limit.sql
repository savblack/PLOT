-- Per-user daily usage cap for Claude-backed Edge Functions
-- (generate-taste-profile, generate-journal). The functions are auth-gated and
-- each call is cheap, but an open public launch means a logged-in user could
-- loop them. This table + SECURITY DEFINER counter enforces a sane daily limit.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  feature text not null,
  count integer not null default 0,
  primary key (user_id, day, feature)
);

-- Only the SECURITY DEFINER function below touches this table. RLS is enabled
-- with no policies so end-user clients (anon/authenticated under RLS) cannot
-- read or tamper with their own counters.
alter table public.ai_usage enable row level security;

-- Atomically record one use of `p_feature` for the current user today and
-- report whether they are still within `p_limit`. Returns false when the cap
-- is exceeded (or there is no authenticated user).
create or replace function public.increment_ai_usage(p_feature text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;

  insert into public.ai_usage (user_id, day, feature, count)
  values (v_user, current_date, p_feature, 1)
  on conflict (user_id, day, feature)
  do update set count = public.ai_usage.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

grant execute on function public.increment_ai_usage(text, integer) to authenticated;

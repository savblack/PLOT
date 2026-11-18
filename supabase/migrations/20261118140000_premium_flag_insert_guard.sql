-- protect_premium_flag (20260913100000) is BEFORE UPDATE only. The column
-- grants (20261014110000) keep is_premium, is_supporter and last_kofi_tip_at out
-- of a client's UPDATE, but INSERT on profiles is not column-restricted, and the
-- insert policy only checks auth.uid() = id. A signed-in user with no profile
-- row could therefore create one with is_premium or is_supporter already true
-- and show the badge. Not reachable today (handle_new_user creates the row at
-- signup and there is no delete policy), but nothing in the database said so.
-- Found in the 2026-11-18 security audit.
--
-- This adds a separate BEFORE INSERT guard instead of recreating
-- protect_premium_flag, so the live update guard's body is not retyped. Same
-- claims handling as that function:
--   * no claims (direct SQL, migrations, GoTrue's handle_new_user path) passes;
--   * service_role (billing, the Ko-fi webhook) passes;
--   * unparseable claims fail closed.
-- A client insert may still create its own row (upsertProfile in
-- packages/core/profile.js inserts only the fields being saved); it just cannot
-- start with a badge set.

create or replace function public.protect_premium_flag_on_insert()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_raw text := current_setting('request.jwt.claims', true);
  v_claims jsonb;
begin
  if coalesce(btrim(v_raw), '') = '' then
    return new;
  end if;

  begin
    v_claims := v_raw::jsonb;
  exception when others then
    v_claims := '{}'::jsonb;
  end;

  if coalesce(v_claims->>'role', '') = 'service_role' then
    return new;
  end if;

  if coalesce(new.is_premium, false) then
    raise exception 'is_premium can only be changed by billing';
  end if;

  if coalesce(new.is_supporter, false) then
    raise exception 'is_supporter can only be changed by the Ko-fi webhook';
  end if;

  if new.last_kofi_tip_at is not null then
    raise exception 'last_kofi_tip_at can only be changed by the Ko-fi webhook';
  end if;

  return new;
end;
$function$;

revoke all on function public.protect_premium_flag_on_insert() from public, anon, authenticated;

drop trigger if exists protect_premium_flag_on_insert on public.profiles;
create trigger protect_premium_flag_on_insert
  before insert on public.profiles
  for each row execute function public.protect_premium_flag_on_insert();

-- Push notifications are Free. The trigger that refused to turn push on for a
-- non-Premium account (enforce_push_premium, 20261012120000) is replaced by one
-- that only stamps push_enabled_at. Existing rows are unchanged. Email alerts
-- stay Premium and are not part of this table.

create or replace function public.stamp_push_enabled_at() returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' or new.push_enabled is distinct from old.push_enabled then
    new.push_enabled_at := case when new.push_enabled then now() else null end;
  end if;
  return new;
end;
$fn$;

drop trigger if exists notification_preferences_push_premium on public.notification_preferences;
drop trigger if exists notification_preferences_push_stamp on public.notification_preferences;
create trigger notification_preferences_push_stamp
  before insert or update on public.notification_preferences
  for each row execute function public.stamp_push_enabled_at();

drop function if exists public.enforce_push_premium();

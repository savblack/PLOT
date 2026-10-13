-- A push token is a bearer for a device, but not a secret: Expo tokens appear
-- in device logs, crash reports and support screenshots. register_push_token
-- used to move any existing token to the caller on conflict, so anyone who
-- learned another member's token could point that device's alerts at their own
-- account and silence the real owner's. Found in the 2026-10-13 security review.
--
-- A token now moves between accounts only when its current binding is already
-- disabled, or belongs to the caller. The legitimate case the old behaviour
-- served (one device, two accounts) is covered by sign-out: the mobile app
-- deletes its own row before signOut (apps/mobile/lib/pushNotifications.ts),
-- so a signed-out device has no live binding to collide with. A device that
-- never signed out keeps its old binding until that account signs out or the
-- token rotates; the app reports that as 'in_use' rather than failing.
--
-- redefines: register_push_token (conflict target unchanged; the update is now
-- conditional on the existing owner)

create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  current_user_id uuid := (select auth.uid());
  existing public.push_tokens%rowtype;
begin
  if current_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$'
     or p_platform not in ('ios', 'android') then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;

  select * into existing from public.push_tokens where token = p_token for update;
  if found and existing.user_id <> current_user_id and existing.disabled_at is null then
    raise exception 'push_token_in_use' using errcode = '42501';
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

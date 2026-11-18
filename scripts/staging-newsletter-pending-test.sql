-- Staging only, transactional; one fictional subscriber row, no existing data changes.
-- Proves 20261118160000 (newsletter double opt-in): a 'pending' row can be
-- written, is never on the digest's recipient list, joins it only once it is
-- 'active', and its confirm token is unique.
--
--   pnpm run staging:test -- newsletter-pending
\set ON_ERROR_STOP on
begin;

insert into public.marketing_subscribers (email, status, confirm_token, confirm_sent_at)
  values ('pending-test@example.invalid', 'pending', 'staging-confirm-token-1', now());

do $$ begin
  if exists (select 1 from public.marketing_recipient_list() where email = 'pending-test@example.invalid') then
    raise notice 'FAIL  a pending address is on the digest recipient list';
  else
    raise notice 'PASS  a pending address is not on the digest recipient list';
  end if;
end $$;

update public.marketing_subscribers
   set status = 'active', confirm_token = null, consented_at = now()
 where email = 'pending-test@example.invalid';

do $$ begin
  if exists (select 1 from public.marketing_recipient_list() where email = 'pending-test@example.invalid') then
    raise notice 'PASS  a confirmed address joins the digest recipient list';
  else
    raise notice 'FAIL  a confirmed address is missing from the digest recipient list';
  end if;
end $$;

do $$ begin
  insert into public.marketing_subscribers (email, status, confirm_token, confirm_sent_at)
    values ('pending-test-2@example.invalid', 'pending', 'dup-token', now()),
           ('pending-test-3@example.invalid', 'pending', 'dup-token', now());
  raise notice 'FAIL  two rows share one confirm token';
exception when unique_violation then
  raise notice 'PASS  confirm tokens are unique';
end $$;

do $$ begin
  insert into public.marketing_subscribers (email, status) values ('pending-test-4@example.invalid', 'maybe');
  raise notice 'FAIL  an unknown status was accepted';
exception when check_violation then
  raise notice 'PASS  the status check still refuses unknown values';
end $$;

rollback;
\echo 'rolled back — Staging is exactly as it was'

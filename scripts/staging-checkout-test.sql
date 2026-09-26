\set ON_ERROR_STOP on
begin;
select to_regclass('public.billing_checkout_attempts') is null as needs_migration \gset
\if :needs_migration
  \i supabase/migrations/20260924020000_checkout_attempts.sql
\endif
create temporary table checkout_fixture as select id from auth.users where email like 'plot-import-qa-%@example.invalid' order by created_at limit 1;
-- Isolate the synthetic fixture inside this rolled-back transaction on repeat runs.
delete from public.billing_checkout_attempts where user_id in (select id from checkout_fixture);
do $$ declare uid uuid; first_claim jsonb; retry_claim jsonb; begin
 select id into uid from checkout_fixture;
 if uid is null then raise exception 'Synthetic pilot required'; end if;
 if has_function_privilege('authenticated','public.claim_billing_checkout(uuid,text,text)','execute') or has_function_privilege('anon','public.claim_billing_checkout(uuid,text,text)','execute') then raise exception 'Client can acquire checkout'; end if;
 if has_table_privilege('authenticated','public.billing_checkout_attempts','select') then raise exception 'Client can read checkout state'; end if;
 first_claim:=public.claim_billing_checkout(uid,'price_monthly_test','https://example.invalid/settings');
 if first_claim is null then raise exception 'First claim failed'; end if;
 if public.claim_billing_checkout(uid,'price_yearly_test','https://example.invalid/settings') is not null then raise exception 'Simultaneous claim allowed'; end if;
 update public.billing_checkout_attempts set lease_until=now()-interval '1 second' where user_id=uid;
 retry_claim:=public.claim_billing_checkout(uid,'price_yearly_test','https://example.invalid/settings');
 if retry_claim->>'operation_id' <> first_claim->>'operation_id' or retry_claim->>'price_id'<>'price_monthly_test' or retry_claim->>'lease_token'=first_claim->>'lease_token' then raise exception 'Recovery identity broken'; end if;
 update public.billing_checkout_attempts set session_id='stale_writer' where user_id=uid and lease_token=(first_claim->>'lease_token')::uuid;
 if (select session_id from public.billing_checkout_attempts where user_id=uid) is not null then raise exception 'Stale lease wrote'; end if;
 raise notice 'PASS clients denied; exclusive claim; stable retry identity; stale writer fenced';
end $$;
rollback;

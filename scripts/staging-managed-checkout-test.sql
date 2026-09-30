\set ON_ERROR_STOP on
begin;
create temporary table managed_fixture as select id from auth.users where email like 'plot-import-qa-%@example.invalid' order by created_at limit 1;
delete from public.billing_checkout_attempts where user_id in (select id from managed_fixture);
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_checkout_attempts' and column_name='managed_payments') as already_applied \gset
\if :already_applied
insert into public.billing_checkout_attempts(user_id,price_id,settings_url,managed_payments)
select id,'price_legacy_test','https://example.invalid/settings',false from managed_fixture;
\else
insert into public.billing_checkout_attempts(user_id,price_id,settings_url)
select id,'price_legacy_test','https://example.invalid/settings' from managed_fixture;
\i supabase/migrations/20260925120000_checkout_managed_payments.sql
\endif
do $$ declare uid uuid; claim jsonb; begin
 select id into uid from managed_fixture;
 if uid is null then raise exception 'Synthetic pilot required'; end if;
 if (select managed_payments from public.billing_checkout_attempts where user_id=uid) then raise exception 'Legacy attempt changed mode'; end if;
 claim:=public.claim_billing_checkout(uid,'price_new_test','https://example.invalid/settings');
 if claim->>'managed_payments' <> 'false' or claim->>'price_id' <> 'price_legacy_test' then raise exception 'Legacy recovery lost'; end if;
 delete from public.billing_checkout_attempts where user_id=uid;
 claim:=public.claim_billing_checkout(uid,'price_new_test','https://example.invalid/settings');
 if claim->>'managed_payments' <> 'true' then raise exception 'New attempt not managed'; end if;
 if has_table_privilege('authenticated','public.billing_checkout_attempts','select') or has_function_privilege('anon','public.claim_billing_checkout(uuid,text,text)','execute') then raise exception 'Client access exposed'; end if;
 raise notice 'PASS legacy mode preserved; new attempts managed; RPC includes mode; clients denied';
end $$;
rollback;

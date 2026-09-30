\set ON_ERROR_STOP on
begin;
select to_regprocedure('public.apply_stripe_subscription_snapshot(bigint,text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz)') is null as needs_migration \gset
\if :needs_migration
\i supabase/migrations/20260924040000_billing_snapshot_guard.sql
\endif
create temporary table ordering_fixture as select id from auth.users where email like 'plot-import-qa-%@example.invalid' order by created_at limit 1;
do $$ declare uid uuid; result jsonb; rev bigint; begin
 select id into uid from ordering_fixture;
 if uid is null then raise exception 'Synthetic pilot required'; end if;
 if has_function_privilege('authenticated','public.apply_stripe_subscription_snapshot(bigint,text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz)','execute') or has_function_privilege('anon','public.apply_stripe_subscription_snapshot(bigint,text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz)','execute') then raise exception 'Client can write billing snapshot'; end if;
 delete from public.billing_customers where user_id=uid;
 result:=public.apply_stripe_subscription_snapshot(null,'evt_order_active','customer.subscription.updated',now(),uid,'cus_order','sub_order','active','price_test',false,now()+interval '30 days');
 if result->>'applied'<>'true' then raise exception 'First snapshot failed'; end if;
 select revision into rev from billing_customers where user_id=uid;
 result:=public.apply_stripe_subscription_snapshot(null,'evt_order_stale_read','customer.subscription.updated',now(),uid,'cus_order','sub_order','canceled','price_test',false,now());
 if result->>'retry'<>'true' or exists(select 1 from stripe_events where id='evt_order_stale_read') then raise exception 'Stale snapshot consumed event'; end if;
 result:=public.apply_stripe_subscription_snapshot(rev,'evt_order_cancel','customer.subscription.updated',now(),uid,'cus_order','sub_order','canceled','price_test',false,now());
 if result->>'applied'<>'true' or public.is_premium(uid) then raise exception 'Equal-time cancellation failed'; end if;
 result:=public.apply_stripe_subscription_snapshot(rev,'evt_order_racing_active','customer.subscription.updated',now(),uid,'cus_order','sub_order','active','price_test',false,now()+interval '30 days');
 if result->>'retry'<>'true' or public.is_premium(uid) then raise exception 'Racing stale snapshot restored Premium'; end if;
 select revision into rev from billing_customers where user_id=uid;
 result:=public.apply_stripe_subscription_snapshot(rev,'evt_order_cancel','customer.subscription.updated',now(),uid,'cus_order','sub_order','active','price_test',false,now()+interval '30 days');
 if result->>'duplicate'<>'true' or public.is_premium(uid) or (select revision from billing_customers where user_id=uid)<>rev then raise exception 'Duplicate changed state or revision'; end if;
 raise notice 'PASS service-only snapshot; first claim; stale revision retries without receipt; equal-time cancellation; racing stale state rejected; duplicate idempotency';
end $$;
rollback;

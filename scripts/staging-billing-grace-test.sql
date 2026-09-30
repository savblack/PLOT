\set ON_ERROR_STOP on
begin;
select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_customers' and column_name='past_due_since') as needs_migration \gset
\if :needs_migration
\i supabase/migrations/20260924030000_billing_grace_start.sql
\endif
create temporary table grace_fixture as select id from auth.users where email like 'plot-import-qa-%@example.invalid' order by created_at limit 1;
do $$ declare uid uuid; first_failure timestamptz; begin
 select id into uid from grace_fixture;
 if uid is null then raise exception 'Synthetic pilot required'; end if;
 delete from public.billing_customers where user_id=uid;
 insert into public.billing_customers(user_id,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end,last_event_at)
 values(uid,'cus_grace_qa','sub_grace_qa','past_due',now()+interval '1 year',now()-interval '4 days');
 if public.is_premium(uid) then raise exception 'Unpaid annual renewal granted a year of access'; end if;
 select past_due_since into first_failure from public.billing_customers where user_id=uid;
 update public.billing_customers set last_event_at=now(),current_period_end=now()+interval '2 years' where user_id=uid;
 if public.is_premium(uid) or (select past_due_since from public.billing_customers where user_id=uid)<>first_failure then raise exception 'Retry extended grace'; end if;
 update public.billing_customers set subscription_status='active' where user_id=uid;
 if not public.is_premium(uid) or (select past_due_since from public.billing_customers where user_id=uid) is not null then raise exception 'Recovery did not reset grace'; end if;
 update public.billing_customers set subscription_status='past_due',last_event_at=now()-interval '1 day' where user_id=uid;
 if not public.is_premium(uid) then raise exception 'New failure did not receive grace'; end if;
 update public.billing_customers set subscription_status='canceled' where user_id=uid;
 if public.is_premium(uid) then raise exception 'Canceled subscription retained access'; end if;
 raise notice 'PASS unpaid future period denied after three days; retries cannot extend grace; recovery resets it; new failure gets grace; canceled denied';
end $$;
rollback;

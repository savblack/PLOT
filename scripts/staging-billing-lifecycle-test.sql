\set ON_ERROR_STOP on
begin;
select to_regprocedure('public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz)') is null as needs_billing_migration \gset
\if :needs_billing_migration
\i supabase/migrations/20260923100000_atomic_stripe_subscription.sql
\endif
-- Only synthetic import-pilot accounts; rollback includes every fixture.
create temporary table billing_fixture as
 select id from auth.users where email like 'plot-import-qa-%@example.invalid' order by created_at limit 1;
do $$ begin
 if (select count(*) from billing_fixture) <> 1 then raise exception 'Synthetic pilot account required'; end if;
end $$;
create temporary table billing_before as select
 (select count(*) from public.history where user_id=f.id) history_count,
 (select count(*) from public.watch_events where user_id=f.id) event_count from billing_fixture f;
delete from public.billing_customers where user_id in(select id from billing_fixture);
-- Removing only synthetic lists inside rollback gives an exact cap boundary.
delete from public.user_custom_lists where user_id in(select id from billing_fixture);
grant select on billing_fixture,billing_before to authenticated,service_role;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from billing_fixture \gset
set local role authenticated;
do $$ begin
 if has_function_privilege('authenticated','public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz)','EXECUTE')
 or has_function_privilege('anon','public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text,boolean,timestamptz)','EXECUTE') then raise exception 'Client can grant Premium'; end if;
 for i in 1..5 loop
  insert into public.user_custom_lists(user_id,name) select id,'Billing proof '||i from billing_fixture;
 end loop;
 begin
  insert into public.user_custom_lists(user_id,name) select id,'Free sixth list' from billing_fixture;
  raise exception 'Sixth free list allowed';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS five free lists; sixth denied; billing RPC inaccessible to clients';
end $$;
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
do $$ declare uid uuid; result jsonb; begin
 select id into uid from billing_fixture;
 result:=public.apply_stripe_subscription_event('evt_billing_proof_active','customer.subscription.updated',now(),uid,'cus_billing_proof','sub_billing_proof','active','price_test',false,now()+interval '30 days');
 if not public.is_premium(uid) or not (select is_premium from profiles where id=uid) then raise exception 'Activation failed'; end if;
 result:=public.apply_stripe_subscription_event('evt_billing_proof_active','customer.subscription.updated',now(),uid,'cus_billing_proof','sub_billing_proof','canceled','price_test',false,now());
 if result->>'duplicate'<>'true' or not public.is_premium(uid) then raise exception 'Duplicate changed entitlement'; end if;
 perform public.apply_stripe_subscription_event('evt_billing_proof_old','customer.subscription.updated',now()-interval '1 hour',uid,'cus_billing_proof','sub_billing_proof','canceled','price_test',false,now());
 if not public.is_premium(uid) then raise exception 'Old event overwrote active state'; end if;
 perform public.apply_stripe_subscription_event('evt_billing_proof_grace','customer.subscription.updated',now(),uid,'cus_billing_proof','sub_billing_proof','past_due','price_test',false,now()-interval '1 day');
 if not public.is_premium(uid) or not (select is_premium from profiles where id=uid) then raise exception 'Grace mismatch'; end if;
 raise notice 'PASS activation, duplicate delivery, older event and three-day grace policy';
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from billing_fixture \gset
set local role authenticated;
insert into public.user_custom_lists(user_id,name) select id,'Premium sixth list' from billing_fixture;
reset role;
-- Inject an actual database error AFTER billing writes, proving rollback.
create function pg_temp.fail_billing_badge() returns trigger language plpgsql as $$ begin raise exception 'injected badge failure'; end $$;
create trigger billing_failure_proof before update of is_premium on public.profiles for each row execute function pg_temp.fail_billing_badge();
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
do $$ declare uid uuid; begin
 select id into uid from billing_fixture;
 begin
  perform public.apply_stripe_subscription_event('evt_billing_proof_retry','customer.subscription.updated',now(),uid,'cus_billing_proof','sub_billing_proof','canceled','price_test',false,now());
  raise exception 'Failure injection did not run';
 exception when raise_exception then if sqlerrm <> 'injected badge failure' then raise; end if; end;
 if exists(select 1 from stripe_events where id='evt_billing_proof_retry') then raise exception 'Failed transaction left receipt'; end if;
 if (select subscription_status from billing_customers where user_id=uid)<>'past_due' then raise exception 'Failed transaction left billing update'; end if;
 raise notice 'PASS badge write failure rolls back billing and receipt together';
end $$;
reset role;
drop trigger billing_failure_proof on public.profiles;
set local role service_role;
do $$ declare uid uuid; begin
 select id into uid from billing_fixture;
 perform public.apply_stripe_subscription_event('evt_billing_proof_retry','customer.subscription.updated',now(),uid,'cus_billing_proof','sub_billing_proof','canceled','price_test',false,now());
 if public.is_premium(uid) or (select is_premium from profiles where id=uid) then raise exception 'Retry did not cancel'; end if;
 perform public.apply_stripe_subscription_event('evt_billing_proof_expired','customer.subscription.updated',now(),uid,'cus_billing_proof','sub_billing_proof','past_due','price_test',false,now()-interval '4 days');
 if public.is_premium(uid) then raise exception 'Expired grace granted Premium'; end if;
 raise notice 'PASS failed event retries, terminal cancellation and expiry deny Premium';
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from billing_fixture \gset
set local role authenticated;
do $$ declare uid uuid; begin
 select id into uid from billing_fixture;
 if (select count(*) from user_custom_lists where user_id=uid)<>6 then raise exception 'Downgrade removed lists'; end if;
 update user_custom_lists set name='Still editable' where user_id=uid and name='Premium sixth list';
 if not found then raise exception 'Downgrade blocked existing list edit'; end if;
 begin
  insert into user_custom_lists(user_id,name) values(uid,'Seventh');
  raise exception 'Downgraded account created another list';
 exception when insufficient_privilege then null; end;
 if (select count(*) from history where user_id=uid)<>(select history_count from billing_before)
 or (select count(*) from watch_events where user_id=uid)<>(select event_count from billing_before) then raise exception 'Downgrade changed history access'; end if;
 raise notice 'PASS downgrade preserves all six lists, editing and history; new lists denied';
end $$;
reset role;
-- Exercise expiry and disconnect on a synthetic Trakt integration without
-- contacting either provider or touching the paused Plex connection.
create temporary table billing_tracking(integration_id uuid, job jsonb);
with created as (
 insert into public.media_integrations(user_id,provider,display_name,status)
 select id,'trakt','Billing rollback proof','active' from billing_fixture returning id
) insert into billing_tracking(integration_id) select id from created;
delete from public.tracking_jobs where user_id in(select id from billing_fixture);
grant all on billing_tracking to authenticated,service_role;
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
select public.apply_stripe_subscription_event('evt_billing_tracking_active','customer.subscription.updated',now(),id,'cus_billing_proof','sub_billing_proof','active','price_test',false,now()+interval '1 day') from billing_fixture \gset
reset role;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from billing_fixture \gset
set local role authenticated;
select public.control_tracking(integration_id,'enable_automatic') from billing_tracking \gset
select public.control_tracking(integration_id,'sync') from billing_tracking \gset
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
update billing_tracking set job=public.claim_tracking_job('trakt',array[(select id from billing_fixture)]);
select public.apply_stripe_subscription_event('evt_billing_tracking_expired','customer.subscription.updated',now(),id,'cus_billing_proof','sub_billing_proof','past_due','price_test',false,now()-interval '4 days') from billing_fixture \gset
do $$ declare result jsonb; r billing_tracking; begin
 select * into r from billing_tracking;
 if r.job is null then raise exception 'No synthetic sync job was claimed'; end if;
 result:=public.finish_tracking_page((r.job->>'id')::uuid,(r.job->>'lease_token')::uuid,'[]','{}',false,0);
 if result->>'paused' is distinct from 'true' then raise exception 'Expiry did not pause in-flight sync'; end if;
 raise notice 'PASS subscription expiry pauses an in-flight automatic tracking job';
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from billing_fixture \gset
set local role authenticated;
do $$ declare status jsonb; begin
 status:=public.get_my_billing_status();
 if status->>'canManage' is distinct from 'true' or status->>'isPremium' is distinct from 'false' then raise exception 'Expired user cannot manage billing'; end if;
 if status ? 'stripe_customer_id' then raise exception 'Billing status exposes Stripe identifiers'; end if;
 raise notice 'PASS expired subscribers retain self-only billing management';
end $$;
update public.media_integrations set status='disabled' where id in(select integration_id from billing_tracking);
do $$ begin
 if exists(select 1 from tracking_jobs where integration_id in(select integration_id from billing_tracking) and status in('queued','running','paused','retry_wait')) then raise exception 'Disconnect left jobs active'; end if;
 if exists(select 1 from tracking_connections where integration_id in(select integration_id from billing_tracking) and (automatic_enabled or outgoing_enabled)) then raise exception 'Disconnect retained consent'; end if;
 if (select count(*) from watch_events where user_id in(select id from billing_fixture))<>(select event_count from billing_before) then raise exception 'Disconnect changed watch history'; end if;
 raise notice 'PASS free disconnect revokes tracking consent and retains viewing history';
end $$;
reset role;
-- A different authenticated subject sees no relationship belonging to the owner.
select set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true) \gset
set local role authenticated;
do $$ begin
 if public.get_my_billing_status()->>'canManage' is distinct from 'false' then raise exception 'Billing account leaked across users'; end if;
 raise notice 'PASS billing status is isolated across accounts';
end $$;
reset role;
rollback;

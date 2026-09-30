\set ON_ERROR_STOP on
begin;
\i supabase/migrations/20260916140001_watch_event_foundation.sql
\i supabase/migrations/20260916150000_import_watch_events.sql
\i supabase/migrations/20260917100000_tracking_jobs.sql
create temporary table tracking_fixture as select h.*,gen_random_uuid() integration_id from public.history h limit 1;
do $$ begin if not exists(select 1 from tracking_fixture) then raise exception 'An existing staging history item is required'; end if; end $$;
insert into public.media_integrations(id,user_id,provider,display_name,status)
select integration_id,user_id,'trakt','Tracking rollback proof','active' from tracking_fixture;
-- Billing has no outbound triggers. All changes below are rolled back.
insert into public.billing_customers(user_id,stripe_customer_id,subscription_status,current_period_end)
select user_id,'tracking-proof-' || user_id::text,'cancelled',now()-interval '30 days' from tracking_fixture
on conflict(user_id) do update set subscription_status = 'cancelled', current_period_end = now()-interval '30 days';
grant select on tracking_fixture to authenticated, service_role;
create temporary table tracking_result(job jsonb, old_lease uuid, payload jsonb);
grant all on tracking_result to authenticated, service_role;
select set_config('request.jwt.claims',json_build_object('sub',user_id,'role','authenticated')::text,true) from tracking_fixture \gset
set local role authenticated;
do $$ declare result jsonb; begin
  result := public.control_tracking((select integration_id from tracking_fixture),'import');
  perform public.control_tracking((select integration_id from tracking_fixture),'import');
  if (select count(*) from public.tracking_jobs) <> 1 then raise exception 'Repeated enqueue duplicated job'; end if;
  if (select outgoing_enabled from public.tracking_connections) then raise exception 'Outgoing default is not private'; end if;
  begin
    perform public.control_tracking((select integration_id from tracking_fixture),'sync');
    raise exception 'Free scheduled sync allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_tracking_job('trakt');
    raise exception 'Client can claim worker jobs';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS free one-time import, single open job, incoming-only default and privileged worker boundary';
end $$;
reset role;
set local role service_role;
do $$ begin
  if public.claim_tracking_job('trakt','{}'::uuid[]) is not null then raise exception 'Empty pilot allowlist claimed work'; end if;
  if public.claim_tracking_job('trakt',array[gen_random_uuid()]) is not null then raise exception 'Unapproved account was claimed'; end if;
  raise notice 'PASS pilot allowlist excludes all unapproved accounts';
end $$;
insert into tracking_result(job,payload)
select public.claim_tracking_job('trakt'),jsonb_build_array(jsonb_build_object(
  'event',jsonb_build_object('source','trakt','source_account','proof-account','source_key','proof-event',
    'tmdb_id',tmdb_id,'media_type',media_type,'date_precision','unknown'),
  'summary',to_jsonb(f))) from tracking_fixture f;
do $$ begin
  if (select job->>'status' from tracking_result) <> 'running' then raise exception 'Job not claimed'; end if;
  if public.claim_tracking_job('trakt') is not null then raise exception 'Concurrent claim succeeded'; end if;
  raise notice 'PASS leased job cannot be claimed twice';
  insert into public.media_integrations(user_id,provider,display_name,status)
    select user_id,'plex','Second account lock proof','active' from tracking_fixture;
  insert into public.tracking_jobs(integration_id,user_id,provider,mode)
    select id,user_id,'plex','import' from public.media_integrations where display_name='Second account lock proof';
  if public.claim_tracking_job('plex') is not null then raise exception 'Two integrations for one account ran simultaneously'; end if;
  delete from public.media_integrations where display_name='Second account lock proof';
  raise notice 'PASS per-account lease excludes simultaneous provider jobs';
end $$;
update public.tracking_jobs set lease_until = now()-interval '1 second';
update tracking_result set old_lease = (job->>'lease_token')::uuid, job = public.claim_tracking_job('trakt');
do $$ declare r tracking_result; begin
  select * into r from tracking_result;
  begin
    perform public.finish_tracking_page((r.job->>'id')::uuid,r.old_lease,r.payload,'{"page":2}'::jsonb,false,0);
    raise exception 'Expired worker committed';
  exception when raise_exception then
    if sqlerrm <> 'Stale job lease' then raise; end if;
  end;
  begin
    perform public.finish_tracking_page((r.job->>'id')::uuid,(r.job->>'lease_token')::uuid,
      r.payload || '[{"event":{},"summary":{}}]'::jsonb,'{"page":99}'::jsonb,false,0);
    raise exception 'Malformed page committed';
  exception when raise_exception then if sqlerrm <> 'Invalid event provenance' then raise; end if; end;
  if exists(select 1 from public.watch_events where source_key='proof-event') then raise exception 'Failed page retained writes'; end if;
  raise notice 'PASS failed page rolls back its events and checkpoint together';
  perform public.finish_tracking_page((r.job->>'id')::uuid,(r.job->>'lease_token')::uuid,r.payload,'{"page":2}'::jsonb,false,0);
  if (select imported from public.tracking_jobs) <> 1 then raise exception 'Page count wrong'; end if;
  raise notice 'PASS reclaimed leases fence stale workers and commit events with checkpoints';
end $$;
update tracking_result set job = public.claim_tracking_job('trakt');
do $$ declare r tracking_result; begin
  select * into r from tracking_result;
  perform public.fail_tracking_job((r.job->>'id')::uuid,(r.job->>'lease_token')::uuid,'Temporary provider failure',120,false);
  if public.claim_tracking_job('trakt') is not null then raise exception 'Retry ignored backoff'; end if;
  if (select checkpoint->>'page' from public.tracking_jobs) <> '2' then raise exception 'Retry lost checkpoint'; end if;
  raise notice 'PASS retry backoff retains the last committed checkpoint';
end $$;
update public.tracking_jobs set available_at = now()-interval '1 second';
update tracking_result set job = public.claim_tracking_job('trakt');
do $$ declare r tracking_result; begin
  select * into r from tracking_result;
  perform public.finish_tracking_page((r.job->>'id')::uuid,(r.job->>'lease_token')::uuid,r.payload,
    jsonb_build_object('page',3,'until',now(),'full',true),true,0);
  if (select imported <> 1 or duplicates <> 1 or status <> 'succeeded' from public.tracking_jobs) then raise exception 'Retry duplicated source event'; end if;
  raise notice 'PASS successful retry is idempotent and records completion';
end $$;
reset role;
update public.billing_customers set subscription_status='active',current_period_end=now()+interval '1 day' where user_id in (select user_id from tracking_fixture);
set local role authenticated;
select public.control_tracking(integration_id,'enable_automatic') from tracking_fixture \gset
select public.control_tracking(integration_id,'sync') from tracking_fixture \gset
reset role;
set local role service_role;
update tracking_result set job = public.claim_tracking_job('trakt');
reset role;
update public.billing_customers set subscription_status='cancelled',current_period_end=now()-interval '30 days' where user_id in (select user_id from tracking_fixture);
set local role service_role;
do $$ declare r tracking_result; result jsonb; begin
  select * into r from tracking_result;
  result := public.finish_tracking_page((r.job->>'id')::uuid,(r.job->>'lease_token')::uuid,'[]'::jsonb,'{}'::jsonb,false,0);
  if result->>'paused' <> 'true' then raise exception 'Expired Premium committed a page'; end if;
  raise notice 'PASS Premium expiry pauses in-flight scheduled work';
end $$;
reset role;
update public.media_integrations set status='disabled' where id in (select integration_id from tracking_fixture);
do $$ begin
  if exists(select 1 from public.tracking_jobs where status in ('running','queued','paused')) then raise exception 'Disconnect left work active'; end if;
  if (select count(*) from public.watch_events where source_key='proof-event') <> 1 then raise exception 'Disconnect deleted imported data'; end if;
  if exists(select 1 from public.tracking_connections where automatic_enabled or outgoing_enabled) then raise exception 'Disconnect retained consent'; end if;
  raise notice 'PASS disconnect cancels jobs and consent while retaining imported watches';
end $$;
-- Cross-source activity is staged for user review rather than guessed/merged.
update public.media_integrations set status='active' where id in(select integration_id from tracking_fixture);
set local role authenticated;
select public.control_tracking(integration_id,'import') from tracking_fixture \gset
reset role;
set local role service_role;
update tracking_result set job=public.claim_tracking_job('trakt'),
  payload=jsonb_set(jsonb_set(payload,'{0,event,source_key}','"cross-source-proof"'),'{0,event,source_account}','"another-source-account"');
do $$ declare r tracking_result; begin
  select * into r from tracking_result;
  perform public.finish_tracking_page((r.job->>'id')::uuid,(r.job->>'lease_token')::uuid,r.payload,'{"page":2}'::jsonb,true,0);
  if exists(select 1 from public.watch_events where source_key='cross-source-proof') then raise exception 'Unreviewed duplicate imported'; end if;
  if not exists(select 1 from public.tracking_review_items where decision='pending') then raise exception 'Duplicate review missing'; end if;
end $$;
reset role;
set local role authenticated;
select public.resolve_tracking_review(id,true) from public.tracking_review_items \gset
reset role;
do $$ begin
  if not exists(select 1 from public.watch_events where source_key='cross-source-proof') then raise exception 'Confirmed watch not imported'; end if;
  raise notice 'PASS cross-source duplicates require an explicit keep-separate decision';
end $$;
-- Watchlist provenance is separate from watches and respects local removals.
set local role authenticated;
select public.control_tracking(integration_id,'import') from tracking_fixture \gset
reset role;
set local role service_role;
do $$ declare lease jsonb; payload jsonb; before_events integer; destination uuid; begin
  select jsonb_build_array(jsonb_build_object('kind','watchlist','source','trakt','source_key','watchlist-proof','summary',to_jsonb(f))) into payload from tracking_fixture f;
  select count(*) into before_events from public.watch_events;
  lease:=public.claim_tracking_job('trakt');
  perform public.finish_tracking_page((lease->>'id')::uuid,(lease->>'lease_token')::uuid,payload,'{"phase":"watchlist_shows"}',true,0);
  if (select count(*) from public.watch_events)<>before_events then raise exception 'Watchlist import created a watch'; end if;
  select id into destination from public.lists where user_id in(select user_id from tracking_fixture) and name='__watchlist__';
  delete from public.list_items where list_id=destination and tmdb_id in(select tmdb_id from tracking_fixture);
  insert into public.tracking_jobs(integration_id,user_id,provider,mode) select integration_id,user_id,'trakt','import' from tracking_fixture;
  lease:=public.claim_tracking_job('trakt');
  perform public.finish_tracking_page((lease->>'id')::uuid,(lease->>'lease_token')::uuid,payload,'{"phase":"watchlist_shows"}',true,0);
  if exists(select 1 from public.list_items where list_id=destination and tmdb_id in(select tmdb_id from tracking_fixture)) then raise exception 'Watchlist sync resurrected local removal'; end if;
  raise notice 'PASS incoming watchlist records preserve local removal and never create watches';
end $$;
reset role;
-- Profile changes cancel old leases in the same transaction as the selection.
set local role service_role;
do $$ declare integration uuid; lease jsonb; begin
  insert into public.media_integrations(user_id,provider,display_name,status)
    select user_id,'plex','Plex selection rollback proof','active' from tracking_fixture returning id into integration;
  insert into public.tracking_connections(integration_id,user_id,automatic_enabled)
    select integration,user_id,true from tracking_fixture;
  insert into public.tracking_jobs(integration_id,user_id,provider,mode)
    select integration,user_id,'plex','import' from tracking_fixture;
  lease := public.claim_tracking_job('plex');
  perform public.select_plex_tracking_source(integration,'{"clientIdentifier":"server","accountID":"7","name":"Server","profileName":"Selected"}','[]');
  if exists(select 1 from public.tracking_jobs where integration_id=integration and status='running') then raise exception 'Profile change left old lease active'; end if;
  if (select automatic_enabled from public.tracking_connections where integration_id=integration) then raise exception 'Profile change retained automatic consent'; end if;
  begin
    perform public.finish_tracking_page((lease->>'id')::uuid,(lease->>'lease_token')::uuid,'[]','{}',true,0);
    raise exception 'Old profile committed after selection';
  exception when raise_exception then if sqlerrm <> 'Stale job lease' then raise; end if; end;
  raise notice 'PASS Plex profile changes fence old workers and require fresh automatic consent';
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true) \gset
set local role authenticated;
do $$ begin
  if exists(select 1 from public.tracking_jobs) or exists(select 1 from public.tracking_connections) or exists(select 1 from public.tracking_review_items) then raise exception 'Cross-account tracking read'; end if;
  begin
    perform public.control_tracking((select integration_id from tracking_fixture),'import');
    raise exception 'Cross-account job control';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS cross-account tracking read and control isolation';
end $$;
reset role;
rollback;

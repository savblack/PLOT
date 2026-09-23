\set ON_ERROR_STOP on
begin;
\i supabase/migrations/20260917020000_saved_list_imports.sql
create temporary table list_fixture as select h.* from public.history h limit 1;
do $$ begin if not exists(select 1 from list_fixture) then raise exception 'An existing staging title is required'; end if; end $$;
grant select on list_fixture to authenticated;
insert into public.billing_customers(user_id,stripe_customer_id,subscription_status,current_period_end)
select user_id,'list-proof-'||user_id::text,'cancelled',now()-interval '30 days' from list_fixture
on conflict(user_id) do update set subscription_status='cancelled',current_period_end=now()-interval '30 days';
-- Only inside this rollback transaction, make room for the boundary proof.
delete from public.user_custom_lists where user_id in(select user_id from list_fixture);
select set_config('request.jwt.claims',json_build_object('sub',user_id,'role','authenticated')::text,true) from list_fixture \gset
set local role authenticated;
do $$ declare payload jsonb; result jsonb; destination uuid; before_history integer; begin
  select jsonb_build_array(jsonb_build_object('source_key','saved-list-proof','note','Source note retained','summary',to_jsonb(f))) into payload from list_fixture f;
  select count(*) into before_history from public.history;
  result:=public.import_saved_list('{"kind":"custom","key":"proof:list","name":"Source list"}',payload);
  if result->>'inserted'<>'1' then raise exception 'List did not import'; end if;
  select list_id into destination from public.imported_lists where source_key='proof:list';
  update public.user_custom_lists set name='My edited name' where id=destination;
  delete from public.user_custom_list_items where list_id=destination;
  result:=public.import_saved_list('{"kind":"custom","key":"proof:list","name":"Source list"}',payload);
  if result->>'duplicates'<>'1' or exists(select 1 from public.user_custom_list_items where list_id=destination) then raise exception 'Reimport resurrected a removed item'; end if;
  if (select name from public.user_custom_lists where id=destination)<>'My edited name' then raise exception 'List rename overwritten'; end if;
  if not exists(select 1 from public.imported_list_entries where imported_list_entries.payload->>'note'='Source note retained') then raise exception 'Source note lost'; end if;
  if (select count(*) from public.history)<>before_history then raise exception 'List invented a watch'; end if;
  raise notice 'PASS list provenance preserves notes, local removal and renaming without writing watch history';
  for n in 2..5 loop
    perform public.import_saved_list(jsonb_build_object('kind','custom','key','proof:'||n,'name','List '||n),'[]');
  end loop;
  result:=public.import_saved_list('{"kind":"custom","key":"proof:6","name":"Sixth list"}','[]');
  if result->>'not_imported'<>'free_list_limit' or (select count(*) from public.user_custom_lists)<>5 then raise exception 'Five-list allowance failed'; end if;
  raise notice 'PASS free imports stop at five lists and explicitly report the omitted list';
  delete from public.user_custom_lists where id=destination;
  result:=public.import_saved_list('{"kind":"custom","key":"proof:list","name":"Source list"}',payload);
  if result->>'not_imported'<>'deleted_in_plot' then raise exception 'Deleted list recreated'; end if;
  raise notice 'PASS reimport retains user list deletion';
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true) \gset
set local role authenticated;
do $$ begin
  if exists(select 1 from public.imported_lists) or exists(select 1 from public.imported_list_entries) then raise exception 'Cross-account provenance leaked'; end if;
  raise notice 'PASS imported-list provenance is private to the owner';
end $$;
reset role;
rollback;

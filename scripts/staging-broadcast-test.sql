\set ON_ERROR_STOP on
begin;
-- Apply only inside this transaction. No staging schema/data persists.
\i supabase/migrations/20260917000000_broadcast_guide.sql
select id as viewer from auth.users order by id limit 1 \gset
select id as other from auth.users where id <> :'viewer' order by id limit 1 \gset
insert into public.broadcast_preferences values (:'viewer', 'Sydney', null), (:'other', 'Perth', '{}');
select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.broadcast_preferences) <> 1 then raise exception 'FAIL account isolation'; end if;
  update public.broadcast_preferences set channel_ids = '{}' where user_id = auth.uid();
  if not found then raise exception 'FAIL own update'; end if;
  if (select cardinality(channel_ids) from public.broadcast_preferences) <> 0 then raise exception 'FAIL empty selection'; end if;
  update public.broadcast_preferences set market_id = 'Sydney' where user_id <> auth.uid();
  if found then raise exception 'FAIL cross-account update'; end if;
  delete from public.broadcast_preferences where user_id <> auth.uid();
  if found then raise exception 'FAIL cross-account delete'; end if;
  raise notice 'PASS owner read/write and empty selection; other account hidden';
end $$;
-- A forged upsert must fail even when the row already exists.
reset role;
select set_config('test.other', :'other', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.broadcast_preferences values (current_setting('test.other')::uuid, 'Sydney', null)
    on conflict (user_id) do update set market_id = excluded.market_id;
    raise exception 'FAIL forged upsert';
  exception when insufficient_privilege then raise notice 'PASS forged upsert refused'; end;
  begin
    insert into storage.objects (bucket_id, name) values ('broadcast-guide', 'forged.json');
    raise exception 'FAIL client schedule upload';
  exception when insufficient_privilege then raise notice 'PASS client schedule upload refused'; end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    if (select count(*) from public.broadcast_preferences) <> 0 then raise exception 'FAIL anonymous preferences exposed'; end if;
    raise notice 'PASS anonymous preferences hidden by RLS';
  exception when insufficient_privilege then raise notice 'PASS anonymous preferences refused'; end;
end $$;
reset role;
rollback;

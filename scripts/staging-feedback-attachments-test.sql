-- Staging only. Run with pnpm run staging:feedback-attachments-test.
-- Load the main checkout's local database credentials before running.
-- Fictional storage metadata only; the entire test rolls back on exit or error.
\set ON_ERROR_STOP on
begin;
\i supabase/migrations/20261025120000_feedback_attachments_private.sql
select set_config('plot.test_owner', gen_random_uuid()::text, true);
select set_config('plot.test_other', gen_random_uuid()::text, true);
select set_config('plot.test_path', current_setting('plot.test_owner') || '/verification-' || gen_random_uuid()::text || '.txt', true);
insert into storage.objects (bucket_id, name, owner_id)
values ('feedback-attachments', current_setting('plot.test_path'), current_setting('plot.test_owner'));
select set_config('request.jwt.claims', json_build_object('sub', current_setting('plot.test_owner'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from storage.objects where bucket_id = 'feedback-attachments' and name = current_setting('plot.test_path')) then
    raise exception 'FAIL owner cannot read their feedback attachment';
  end if;
  raise notice 'PASS owner can read their feedback attachment';
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('plot.test_other'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'feedback-attachments' and name = current_setting('plot.test_path')) then
    raise exception 'FAIL another account can read the feedback attachment';
  end if;
  raise notice 'PASS another account cannot read the feedback attachment';
end $$;
reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $$ begin
  begin
    if exists (select 1 from storage.objects where bucket_id = 'feedback-attachments' and name = current_setting('plot.test_path')) then
      raise exception 'FAIL anonymous reader can read the feedback attachment';
    end if;
    raise notice 'PASS anonymous reader cannot read the feedback attachment';
  exception when insufficient_privilege then
    raise notice 'PASS anonymous reader has no storage read privilege';
  end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'feedback-attachments' and public = false) then
    raise exception 'FAIL feedback bucket is public or missing';
  end if;
  raise notice 'PASS feedback bucket is private';
end $$;
rollback;

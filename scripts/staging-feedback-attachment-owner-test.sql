-- Staging only, transactional; one fictional storage row, no existing user data changes.
-- Proves 20261103130000: the owner can read (and so delete) their own feedback
-- attachment metadata, and nobody else can.
\set ON_ERROR_STOP on
begin;
select id as owner from auth.users order by id limit 1 \gset
select id as other from auth.users where id <> :'owner' order by id limit 1 \gset
insert into storage.objects (bucket_id, name, owner_id)
  values ('feedback-attachments', 'feedback/00000000-0000-4000-8000-00000000f00d.png', :'owner');

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from storage.objects where bucket_id = 'feedback-attachments'
                 and name = 'feedback/00000000-0000-4000-8000-00000000f00d.png') then
    raise exception 'owner cannot read own attachment';
  end if;
  raise notice 'PASS owner can read own feedback attachment';
  if exists (select 1 from storage.objects where bucket_id = 'feedback-attachments'
             and owner_id <> auth.uid()::text) then
    raise exception 'owner can read another account''s attachment';
  end if;
  raise notice 'PASS owner sees only their own attachments';
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'other', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from storage.objects
             where name = 'feedback/00000000-0000-4000-8000-00000000f00d.png') then
    raise exception 'bystander can read the attachment';
  end if;
  raise notice 'PASS another account cannot read the attachment';
end $$;
reset role;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $$ begin
  if exists (select 1 from storage.objects
             where name = 'feedback/00000000-0000-4000-8000-00000000f00d.png') then
    raise exception 'anonymous read of attachment metadata';
  end if;
  raise notice 'PASS anonymous reader cannot see the attachment';
end $$;
reset role;

-- Supabase blocks direct SQL deletes from storage tables (storage.protect_delete),
-- so deletion itself goes through the Storage API. What SQL can prove is that
-- the existing owner-delete policy carries the same owner check as the new read.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'Owners can delete feedback attachments' and cmd = 'DELETE'
                 and qual like '%owner_id%auth.uid()%') then
    raise exception 'owner-delete policy missing or not owner-scoped';
  end if;
  raise notice 'PASS owner-delete policy is owner-scoped, matching the new read policy';
end $$;
rollback;

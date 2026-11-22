-- Staging only, transactional; one fictional storage row, no existing user data changes.
-- Proves 20261118100000 and 20261118120000: avatar object metadata is readable
-- only by its owner (the folder list no longer exposes every user id), and the
-- delete policy that "Remove photo" relies on exists and is owner-scoped.
-- Public image URLs (/object/public/avatars/...) do not go through these
-- policies, so viewers of a public profile are unaffected.
\set ON_ERROR_STOP on
begin;
select id as owner from auth.users order by id limit 1 \gset
select id as other from auth.users where id <> :'owner' order by id limit 1 \gset
insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', :'owner' || '/staging-avatar-test.jpg', :'owner');

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from storage.objects where bucket_id = 'avatars'
                 and name = auth.uid()::text || '/staging-avatar-test.jpg') then
    raise exception 'owner cannot list their own avatar folder';
  end if;
  raise notice 'PASS owner can list their own avatar folder';
  if exists (select 1 from storage.objects where bucket_id = 'avatars'
             and (storage.foldername(name))[1] <> auth.uid()::text) then
    raise exception 'owner can see another account''s avatar folder';
  end if;
  raise notice 'PASS owner sees only their own folder';
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'other', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'avatars'
             and name like '%/staging-avatar-test.jpg') then
    raise exception 'another account can list the avatar';
  end if;
  raise notice 'PASS another account cannot list the avatar';
end $$;
reset role;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'avatars') then
    raise exception 'anonymous reader can list avatar folders';
  end if;
  raise notice 'PASS anonymous reader cannot list any avatar folder';
end $$;
reset role;

-- Supabase blocks direct SQL deletes from storage tables (storage.protect_delete),
-- so the delete itself goes through the Storage API. SQL can prove the policy
-- exists, is for authenticated users only, and carries the folder check.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'Users can delete their own avatar' and cmd = 'DELETE'
                 and roles = array['authenticated']::name[]
                 and qual like '%avatars%foldername%auth.uid()%') then
    raise exception 'avatar delete policy missing or not owner-scoped';
  end if;
  raise notice 'PASS avatar delete policy is owner-scoped';
end $$;
rollback;

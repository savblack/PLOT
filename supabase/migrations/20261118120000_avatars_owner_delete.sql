-- The avatars bucket has insert, update and (since 20261118100000) owner-only
-- select policies, but no delete policy was ever created, in a migration or on
-- production. "Remove photo" in Settings (SettingsView.jsx handleRemove) and the
-- mobile helper (apps/mobile/lib/avatar.ts removeAvatar) list the caller's own
-- folder and remove what they find; with no delete policy that remove was
-- refused and the old image stayed in the public bucket after the person
-- cleared it. Found in the 2026-11-18 audit review.
--
-- Same folder check as the existing avatar policies: a person may delete only
-- objects under their own user id. delete-account uses the service role and is
-- unaffected.

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $guard$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users can delete their own avatar' and cmd = 'DELETE'
  ) then
    raise exception 'avatar delete policy missing';
  end if;
end
$guard$;

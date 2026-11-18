-- Two storage findings from the 2026-11-18 security audit.
--
-- 1. feedback-attachments accepted any image/* type, which includes
--    image/svg+xml. An SVG can carry <script>, and notify-feedback mints a
--    one-year signed URL that lands on the Notion feedback card. The bucket is
--    private (20261025120000) and served from the storage origin, not the app,
--    so it cannot reach a Plot session, but there is no reason to store markup.
--    Narrow it to raster screenshots. The feedback form filters to the same
--    list (FEEDBACK_ATTACHMENT_MIME_TYPES in packages/core/feedbackAttachments.js)
--    so a person picking another type never hits an upload error.
--    Avatars were narrowed the same way in 20261014090100.
--
-- 2. "Avatars are publicly readable" (20260330000000) granted SELECT on every
--    avatars object to anon. Image URLs do not need it: a public bucket serves
--    /object/public/avatars/... without any policy. What it did allow is the
--    list endpoint, which returns every folder name, and each folder name is a
--    user id, private profiles included. The only list calls are Settings and
--    the mobile avatar helper clearing the caller's own folder
--    (SettingsView.jsx, apps/mobile/lib/avatar.ts), and upsert: true also reads
--    the caller's own object. So SELECT becomes owner-only, matching the
--    existing insert and update policies.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'feedback-attachments';

drop policy if exists "Avatars are publicly readable" on storage.objects;
drop policy if exists "Users can read their own avatar folder" on storage.objects;
create policy "Users can read their own avatar folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $guard$
begin
  if exists (
    select 1 from storage.buckets
    where id = 'feedback-attachments'
      and (allowed_mime_types is null or 'image/svg+xml' = any(allowed_mime_types) or 'image/*' = any(allowed_mime_types))
  ) then
    raise exception 'feedback-attachments still accepts SVG';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Avatars are publicly readable'
  ) then
    raise exception 'avatars bucket is still listable by anyone';
  end if;
end
$guard$;

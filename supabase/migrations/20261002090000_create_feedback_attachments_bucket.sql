-- Create the feedback-attachments bucket that feedback screenshots upload to.
--
-- WHY: the bucket never existed on either project. No migration created it,
-- and production's two storage policies for it (upload, and the owner-delete
-- policy from 20260918030000) have always pointed at nothing. The web feedback
-- form (SettingsView.jsx) uploads each screenshot before saving the feedback
-- row and abandons the whole submission if any upload fails, so feedback with
-- a screenshot has never been sendable: production has 3 feedback rows and
-- none with attachments. Found by `pnpm run db:drift` on 2026-10-01.
--
-- Shape follows the code that reads and writes it:
--   • public: SettingsView stores getPublicUrl() links on the feedback row,
--     and notify-feedback / delete-account parse /object/public/… URLs.
--     Paths are feedback/<uuid>.<ext>, so a link is not guessable.
--   • 5 MB, images only: the form's MAX_IMAGE_MB = 5 and image/* filter.
--     notify-feedback copies files into linear-archive/ with the service
--     role, which these limits do not block.
--
-- The upload policy is recreated here so a migration owns it (production's
-- was created by hand) and so it only accepts the path shape the app
-- generates. That is the same regex delete-account and notify-feedback
-- already validate against.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-attachments', 'feedback-attachments', true, 5242880, array['image/*'])
on conflict (id) do nothing;

drop policy if exists "Users can upload feedback attachments" on storage.objects;
create policy "Users can upload feedback attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and name ~ '^feedback/[0-9a-fA-F-]{36}(\.[a-zA-Z0-9]{1,10})?$'
  );

do $guard$
begin
  if not exists (select 1 from storage.buckets where id = 'feedback-attachments' and public) then
    raise exception 'feedback-attachments bucket missing or not public';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'Owners can delete feedback attachments') then
    raise exception 'expected the owner-delete policy from 20260918030000 to exist';
  end if;
end
$guard$;

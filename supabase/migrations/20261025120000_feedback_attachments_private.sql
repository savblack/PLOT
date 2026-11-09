-- feedback-attachments was created public so Settings and notify-feedback could
-- store /object/public URLs. Those URLs are now a problem: the bucket was
-- closed on production (public = false) and a public object URL returns
-- 400/403. Screenshots on Notion cards stopped loading.
--
-- This lines Staging up with that closure so check-migration-drift stops
-- flagging bucket:feedback-attachments. The app stores a signed URL (or the
-- storage path) and notify-feedback signs the archived copy with the service
-- role. Owners can read their own objects, which is what createSignedUrl
-- checks before it will mint a URL for the browser.

update storage.buckets
  set public = false
  where id = 'feedback-attachments';

-- Same body as main's 20261103130000_feedback_attachment_owner_select, which
-- production applied first. Keep the (select ...) wrapper: it evaluates
-- auth.uid() once per query instead of once per row, and this migration
-- replaces the live policy when it runs.
drop policy if exists "Owners can read feedback attachments" on storage.objects;
create policy "Owners can read feedback attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and owner_id = (select auth.uid()::text)
  );

do $guard$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'feedback-attachments' and public = false
  ) then
    raise exception 'feedback-attachments bucket missing or still public';
  end if;
end
$guard$;

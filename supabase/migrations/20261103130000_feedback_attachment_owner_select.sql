-- Storage deletion needs both SELECT and DELETE on an object. Keep metadata
-- visibility limited to the authenticated owner; the existing DELETE policy
-- has the same owner check.
drop policy if exists "Owners can read feedback attachments" on storage.objects;
create policy "Owners can read feedback attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and owner_id = (select auth.uid()::text)
  );

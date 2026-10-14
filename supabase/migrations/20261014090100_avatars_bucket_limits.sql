-- The avatars bucket is public and accepted any object type at any size: the
-- only checks were client-side (packages/core/profileFields.js accepts any
-- image/*). An SVG with a <script> uploaded as an avatar executes when opened
-- directly on the storage origin. Found in the 2026-10-13 security review.
--
-- Every writer already sends JPEG (Settings crops to JPEG, mobile uploads
-- JPEG, the public-profile editor now re-encodes to JPEG before upload), so
-- limiting the bucket to raster image types and the 5 MB the UI advertises
-- (AVATAR_MAX_MB) changes nothing for a real upload. Mirrors the limits the
-- feedback-attachments bucket has had since 20261002090000.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

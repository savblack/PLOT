-- public.public_profiles is intentionally a SECURITY DEFINER projection. It is
-- the only anonymous profile-read surface: profiles itself remains protected by
-- RLS, while this view exposes only opted-in rows and the five fields below.
--
-- Do not add columns or remove the `is_public = true` predicate without a
-- separate privacy review. `security_barrier` prevents caller-supplied
-- predicates from being pushed below this view's privacy boundary.
alter view public.public_profiles set (security_barrier = true);

comment on view public.public_profiles is
  'Intentional SECURITY DEFINER public projection. Exposes only id, username, display_name, avatar_url and is_premium where is_public = true. profiles remains RLS-protected; changes require privacy review.';

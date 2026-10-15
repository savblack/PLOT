-- Hide the regional rating on title panels.
--
-- Shown by default. The member turns it off from the guide itself. The
-- column is absent from the profile update grant until it is listed here,
-- so the client write would be rejected without this grant.

alter table public.profiles
  add column if not exists show_parental_guide boolean not null default true;

comment on column public.profiles.show_parental_guide is
  'When false, title panels hide the regional rating and content advisories.';

grant update (show_parental_guide) on public.profiles to authenticated;

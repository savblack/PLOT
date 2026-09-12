-- Server-side limits on the free-text profile fields.
--
-- App Store Guideline 1.2 treats usernames, display names and bios as
-- user-generated content, and docs/research/app-store-guideline-1-2.md asks for
-- "length and character constraints on the free-text fields", enforced where the
-- client cannot bypass them.
--
-- Today only `bio` has one (280, added with the column). `display_name` is
-- capped at 50 by a maxLength attribute and nowhere else, and `links` is
-- unconstrained jsonb. Neither is a real limit: the anon key is public and RLS
-- lets a user update their own profiles row, so anything the browser enforces is
-- advisory. The numbers here deliberately match the inputs in
-- PublicProfilePage.jsx so nothing a user can type in the UI is rejected.
--
-- `username` needs nothing: USERNAME_RE already bounds it and it has a unique
-- index.

alter table public.profiles
  drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 50);

-- `links` is a jsonb object keyed by the fixed platform set in
-- packages/core/profileFields.js. Five of the six store a bare handle and the
-- URL is templated onto a known host at render time, so they cannot carry an
-- arbitrary destination; `website` is the one free-form value, and it renders
-- with rel="noopener noreferrer nofollow ugc".
--
-- What was missing is any bound at all: an unconstrained jsonb column on a
-- publicly readable row is a storage surface, and "only known keys are
-- rendered" is a property of today's UI rather than of the data.
--
-- 200 is chosen over the UI's 30 so the website value has room; handles are far
-- shorter in practice and the point is a ceiling, not a fit.
-- Postgres forbids a subquery directly in a CHECK, and jsonb_each is one. An
-- IMMUTABLE helper is the documented way round it: the subquery is legal inside
-- a function, and the function is legal in the constraint. New function, so none
-- of the create-or-replace hazard that applies to redefining an existing body.
create or replace function public.profile_links_ok(l jsonb)
returns boolean language sql immutable as $$
  select l is null
     or (
       jsonb_typeof(l) = 'object'
       -- Stripping every known key must leave nothing behind.
       and (l - 'instagram' - 'x' - 'tiktok' - 'youtube' - 'letterboxd' - 'website') = '{}'::jsonb
       and not exists (
         select 1 from jsonb_each(l) as e(key, value)
         where jsonb_typeof(e.value) <> 'string'
            or char_length(e.value #>> '{}') > 200
       )
     )
$$;

comment on function public.profile_links_ok(jsonb) is
  'Keys limited to packages/core/profileFields.js SOCIAL_LINKS; values are strings <= 200 chars. Adding a platform there means widening this in the same PR.';

alter table public.profiles
  drop constraint if exists profiles_links_shape;
alter table public.profiles
  add constraint profiles_links_shape check (public.profile_links_ok(links));

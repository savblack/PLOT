-- Onboarding collects the user's first name and favorite genres.
-- genres matches the pre-existing profiles.genres text[] column (genre
-- names, not TMDB ids) rather than introducing a second, jsonb-typed shape.
alter table profiles
  add column if not exists first_name text,
  add column if not exists genres text[] not null default '{}';

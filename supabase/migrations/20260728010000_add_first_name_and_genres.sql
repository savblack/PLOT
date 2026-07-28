-- Onboarding collects the user's first name and favorite genres.
alter table profiles
  add column if not exists first_name text,
  add column if not exists genres jsonb not null default '[]';

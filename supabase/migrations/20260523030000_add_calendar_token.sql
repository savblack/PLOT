-- Per-user secret token for the calendar feed subscription URL.
-- Regenerating the token invalidates the old URL.
alter table profiles
  add column if not exists calendar_token text unique;

-- Add IANA timezone field to profiles (e.g. "Australia/Sydney")
alter table profiles
  add column if not exists timezone text;

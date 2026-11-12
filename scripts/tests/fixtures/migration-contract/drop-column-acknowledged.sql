-- contracts: profiles.legacy_flag (web and mobile stopped reading it in #1200; iPhone 1.4 is the oldest build allowed to sign in)
alter table public.profiles drop column if exists legacy_flag;

-- Removes a column the web app still reads. Mentioning `drop column` in a
-- comment like this one is not itself a change.
alter table public.profiles drop column if exists legacy_flag;

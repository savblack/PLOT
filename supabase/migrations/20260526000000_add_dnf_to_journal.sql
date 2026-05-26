-- Add "didn't finish" flag to journal entries
alter table journal add column if not exists dnf boolean not null default false;

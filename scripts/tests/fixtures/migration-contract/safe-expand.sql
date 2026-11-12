-- Expand only: new table, new nullable column, new column with a default,
-- a function dropped and recreated with a new signature, a temp table, a
-- view replaced by a table of the same name, DDL inside a function body.
create table public.shelf (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  label text not null
);
alter table public.shelf add column note text not null;
alter table public.profiles add column bio text;
alter table public.profiles add column show_bio boolean not null default true;
alter table public.profiles add constraint bio_len check (char_length(bio) < 500);
alter table public.profiles alter column bio set default '';
alter table public.profiles drop constraint if exists old_check;

drop function if exists public.enqueue_job(uuid, text);
create or replace function public.enqueue_job(p_user uuid, p_kind text, p_hash text default null)
returns void language plpgsql as $$
begin
  create temp table scratch (id int);
  drop table scratch;
  alter table public.profiles drop column if exists not_really;
end $$;

create temp table staging_rows (id int);
drop table staging_rows;

drop view public.public_cards;
create table public.public_cards (id uuid primary key);

drop trigger if exists t on public.profiles;
drop policy if exists p on public.profiles;
drop index if exists public.profiles_idx;

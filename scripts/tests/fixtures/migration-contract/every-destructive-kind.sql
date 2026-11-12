drop table if exists public.old_a, public.old_b cascade;
drop materialized view if exists public.old_signals;
drop function if exists public.old_rpc(integer), public.other_rpc();
drop type if exists public.old_kind;
alter table public.history
  drop column old_note,
  alter column rating type numeric(3,1),
  alter column watched_at set not null,
  add column source text not null;
alter table public.journal rename to diary;
alter table public.history rename column seen_on to watched_on;
alter function public.old_name(uuid) rename to new_name;
alter view public.old_view rename to new_view;
alter type public.watch_status rename value 'plan' to 'planned';
alter type public.mood rename to feeling;
do $$
begin
  alter table public.profiles drop column if exists do_block_col;
end $$;

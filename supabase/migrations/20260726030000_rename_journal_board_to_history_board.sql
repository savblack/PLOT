-- Rename `journal_board` to `history_board`, completing the move away from
-- the "journal" framing. This table has no CREATE TABLE in this repo's
-- migration history (created directly against the live database before
-- migrations were tracked), so the rename is guarded against the catalog
-- rather than assumed — safe no-op if the table or a given constraint/index
-- doesn't exist or doesn't match the expected default name.

do $$
begin
  if exists (select 1 from pg_class where relkind = 'r' and relname = 'journal_board')
     and not exists (select 1 from pg_class where relkind = 'r' and relname = 'history_board')
  then
    alter table public.journal_board rename to history_board;
  end if;
end $$;

-- Primary key / backing sequence, if present under the default naming.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'journal_board_pkey')
     and not exists (select 1 from pg_constraint where conname = 'history_board_pkey')
  then
    alter table public.history_board rename constraint journal_board_pkey to history_board_pkey;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_class where relkind = 'S' and relname = 'journal_board_id_seq')
     and not exists (select 1 from pg_class where relkind = 'S' and relname = 'history_board_id_seq')
  then
    alter sequence public.journal_board_id_seq rename to history_board_id_seq;
  end if;
end $$;

-- Defensive catch-all for any other constraint/index still named after
-- "journal_board" (or plain "journal") on this table.
do $$
declare
  rec record;
  new_name text;
begin
  if to_regclass('public.history_board') is null then
    return;
  end if;

  for rec in
    select conname from pg_constraint
    where conrelid = 'public.history_board'::regclass and conname like '%journal%'
  loop
    new_name := replace(rec.conname, 'journal', 'history');
    execute format('alter table public.history_board rename constraint %I to %I', rec.conname, new_name);
  end loop;

  for rec in
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'history_board' and indexname like '%journal%'
  loop
    new_name := replace(rec.indexname, 'journal', 'history');
    execute format('alter index public.%I rename to %I', rec.indexname, new_name);
  end loop;
end $$;

-- Any RLS policies on the table that still say "journal" in their name.
do $$
declare
  rec record;
  new_name text;
begin
  if to_regclass('public.history_board') is null then
    return;
  end if;

  for rec in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'history_board' and policyname like '%journal%'
  loop
    new_name := replace(rec.policyname, 'journal', 'history');
    execute format('alter policy %I on public.history_board rename to %I', rec.policyname, new_name);
  end loop;
end $$;

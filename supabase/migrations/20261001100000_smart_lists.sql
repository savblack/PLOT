-- Smart lists (PLO-513): a custom list that stores filter rules instead of
-- titles. The client fills it each time it opens (packages/core/smartLists.js).
--
-- Additive only: one nullable column and three new trigger functions. No
-- existing function is recreated, and no existing row changes (every list
-- keeps rules = null, which is what a manual list is).
--
-- What the database enforces, since the client only pre-checks:
--   1. Only Premium writes rules. Checked when rules are inserted or changed
--      by a signed-in user; renaming or deleting a smart list after Premium
--      lapses still works, the same as lists above the Free cap.
--   2. A list's kind is fixed. Rules cannot be added to a manual list or
--      removed from a smart one, so no list silently loses its titles.
--   3. A smart list stays private. Its matches come from the owner's own
--      watchlist, history and services, which nobody else can read.
--   4. A smart list holds no titles and has no members.
--
-- Smart lists still count toward the Free cap in
-- enforce_custom_list_creation_cap (it counts every row), which is correct:
-- only Premium can create one, and Premium has no cap.
--
-- Renumbered from 20260928100000 to 20261001100000: by the time this merges,
-- main had applied newer migrations (20261001090000), and an older version
-- would be skipped. It must sort after main's newest migration when it lands.

alter table public.user_custom_lists
  add column if not exists rules jsonb;

comment on column public.user_custom_lists.rules is
  'Smart list filter rules (packages/core/smartLists.js SmartListRules). Null for a manual list.';

-- Fires after sync_custom_list_visibility (triggers run in name order), so
-- visibility and is_public already agree when it checks them.
create function public.validate_smart_list()
returns trigger
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (old.rules is null) <> (new.rules is null) then
    raise exception using errcode = 'P0001', message = 'smart_list_kind_fixed';
  end if;
  if new.rules is null then
    return new;
  end if;
  if jsonb_typeof(new.rules) <> 'object' or pg_column_size(new.rules) > 4096 then
    raise exception using errcode = 'P0001', message = 'smart_list_rules_invalid';
  end if;
  if new.visibility <> 'private' or new.is_public then
    raise exception using errcode = 'P0001', message = 'smart_list_private_only';
  end if;
  -- Service-role writes (auth.uid() is null) are not gated, as in the cap trigger.
  if auth.uid() is not null
     and (tg_op = 'INSERT' or new.rules is distinct from old.rules)
     and not public.is_premium() then
    raise exception using errcode = 'P0001', message = 'smart_list_premium_required';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_smart_list() from public, anon, authenticated;
create trigger validate_smart_list
before insert or update on public.user_custom_lists
for each row execute function public.validate_smart_list();

-- Titles are never stored on a smart list. Covers direct inserts and the
-- shared list RPCs alike. security definer so a member's insert (through
-- add_shared_list_item) can still read the list row.
create function public.reject_smart_list_items()
returns trigger
language plpgsql stable security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.user_custom_lists where id = new.list_id and rules is not null) then
    raise exception using errcode = 'P0001', message = 'smart_list_has_no_items';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_smart_list_items() from public, anon, authenticated;
create trigger reject_smart_list_items
before insert on public.user_custom_list_items
for each row execute function public.reject_smart_list_items();

-- Matches come from the owner's library, so a member would see nothing.
create function public.reject_smart_list_members()
returns trigger
language plpgsql stable security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.user_custom_lists where id = new.list_id and rules is not null) then
    raise exception using errcode = 'P0001', message = 'smart_list_not_shareable';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_smart_list_members() from public, anon, authenticated;
create trigger reject_smart_list_members
before insert on public.user_custom_list_members
for each row execute function public.reject_smart_list_members();

-- redefines: update_watching_progress_updated_at (keep a caller-supplied updated_at)
--
-- The trigger stamped now() on every update, so undoing an episode tick
-- (which writes the previous updated_at back, packages/core/useWatching.js
-- restorePointer) moved the show to the front of Continue watching instead
-- of back to where it was.
--
-- Now: an update that changes updated_at keeps the caller's value; one that
-- leaves it alone still gets now(). Undo is the only client write that sends
-- updated_at; ticks, jumps and start-watching leave it to this trigger, so
-- the stored time is always the server's except when undo restores it. A user can only write their own rows (RLS), so a
-- supplied timestamp can only reorder their own list, and one in the future
-- (a fast device clock) is clamped to now().
--
-- Previous body (20260522000000), unchanged since; 20261012130000 added
-- search_path, kept here because create or replace drops it.
create or replace function public.update_watching_progress_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.updated_at is not distinct from old.updated_at
     or new.updated_at is null
     or new.updated_at > now() then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

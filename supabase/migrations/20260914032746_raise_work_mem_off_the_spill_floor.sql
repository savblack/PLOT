-- Raise work_mem so the platform's catalog scrapes stop spilling to disk.
--
-- 20260913230451 resets pg_stat_statements weekly, which keeps the view small
-- enough that a scrape fits in work_mem. That treats the input, not the
-- ceiling: at 2,184 kB (the Micro default) ANY catalog query a little larger
-- than the view spills, so the next expensive thing the platform decides to
-- scrape costs disk IO again and the reset does not help.
--
-- Measured on production, same sort at two settings:
--
--   work_mem = 2184kB   Sort Method: external merge   4,280 kB   Disk
--   work_mem = 8MB      Sort Method: quicksort        5,144 kB   Memory
--
-- For context on what that was costing: 173 GB of temp files across 81,434 of
-- them, roughly 350x all other database IO combined, on a 23 MB database with a
-- 100% cache hit ratio. See 20260913230451 for the full diagnosis.
--
-- WHY THE DATABASE AND NOT THE ROLE: the sessions doing the spilling run as
-- supabase_admin (they also `set pg_stat_statements.track = none`, which is why
-- they never appear in pg_stat_statements). `alter role supabase_admin set
-- work_mem` is refused — "reserved role, only superusers can modify it" — and
-- postgres is not a superuser on Supabase. Database level is the only lever
-- this project actually has.
--
-- WHY 8MB AND NOT MORE: work_mem is per sort node, not per connection, so the
-- worst case scales with concurrent sorts on a 1 GB instance whose
-- shared_buffers is already 224 MB. 8 MB clears the measured spill with
-- headroom and keeps the worst case modest; the application's own queries sort
-- almost nothing (the largest table is under 2 MB). Raise it further only with
-- a measurement, not a hunch.
--
-- This does NOT make the weekly reset redundant, and the two are deliberately
-- kept together: the reset bounds the input, this bounds the ceiling. Either
-- alone leaves a gap — an unbounded view would eventually outgrow 8 MB too.
--
-- Reversible: `alter database <db> reset work_mem`.
--
-- Applies to sessions started after this runs; existing pooled connections keep
-- the old value until they are recycled.

do $$
begin
  -- current_database() rather than a literal: the name is `postgres` on
  -- Supabase but this also has to run against the throwaway sandbox in
  -- scripts/db-migration-test.sh, where it is not.
  execute format('alter database %I set work_mem = %L', current_database(), '8MB');
end
$$;

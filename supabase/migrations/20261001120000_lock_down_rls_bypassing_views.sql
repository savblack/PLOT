-- Make public_profiles read-only for anon and authenticated, and take
-- marketing_template_stats away from them entirely.
--
-- WHY: both views are security_invoker = off, so they run as their owner
-- (postgres) and do not apply RLS on the tables underneath. profiles has RLS
-- enabled but not forced, so the owner, and therefore the view, bypasses it.
--
-- Every migration that created public_profiles granted SELECT only. But the
-- project's default privileges give anon and authenticated ALL on any new
-- relation postgres creates in public, so each `create view` silently added
-- INSERT, UPDATE and DELETE on top. public_profiles is a simple single-table
-- view, which Postgres treats as auto-updatable: anyone holding the public
-- anon key could, through PostgREST, rename any public profile, change its
-- username or avatar, or delete its profiles row. protect_premium_flag still
-- blocked is_premium / is_supporter changes; nothing else did. Found by
-- `pnpm run db:drift` on 2026-10-01 from catalog evidence (no write was
-- attempted: profiles carries webhook triggers).
--
-- marketing_template_stats is not updatable, but anon could read aggregate
-- marketing metrics through it, again bypassing RLS. Nothing outside the
-- service role reads it (marketing/metrics/report.mjs uses the service key).
--
-- Every app read of public_profiles is a GET (OG worker, Pages Functions,
-- sitemap), so SELECT stays.
--
-- KEEP THIS IN MIND when recreating either view: `drop view` + `create view`
-- re-applies the default privileges and reopens the hole. Recreate it, then
-- repeat these revokes in the same migration. (`create or replace view` keeps
-- existing grants.)

revoke insert, update, delete, truncate, references, trigger, maintain
  on public.public_profiles from public, anon, authenticated;

revoke all on public.marketing_template_stats from public, anon, authenticated;

-- Asserts only what the revokes must have removed. That SELECT survives is
-- checked by scripts/staging-rls-bypass-views-test.sql instead: db:migration-test
-- restores production with --no-privileges, so no grant exists in that sandbox
-- and a "still has SELECT" assertion here would fail there on a correct migration.
do $guard$
declare
  r text;
  p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['insert', 'update', 'delete', 'truncate'] loop
      if has_table_privilege(r, 'public.public_profiles', p) then
        raise exception '% still has % on public.public_profiles', r, p;
      end if;
    end loop;
    if has_table_privilege(r, 'public.marketing_template_stats', 'select') then
      raise exception '% can still read public.marketing_template_stats', r;
    end if;
  end loop;
end
$guard$;

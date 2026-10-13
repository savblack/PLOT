-- No view that bypasses RLS may be writable by anon or authenticated.
--
-- A view with security_invoker = off runs as its owner, so RLS on the tables
-- underneath does not apply to it. public_profiles used to be such a view;
-- it is now an RLS-protected table containing only public profile fields.
-- Until 20261001120000 the view's callers could do everything: the
-- project's default privileges give anon and authenticated ALL on every new
-- relation, so each `create view … ; grant select …` quietly granted INSERT,
-- UPDATE and DELETE too, and an auto-updatable view passed them straight
-- through to profiles.
--
-- The trap is permanent: any future `drop view` + `create view` re-applies the
-- defaults. So this checks every such view in public, not just the two that
-- were fixed, and needs no edit when a new one is added.
--
--   set -a; . .env; set +a
--   npm run staging:rls-bypass-views-test
--
-- Catalog reads only, inside a transaction that ends in rollback. It is also
-- safe to point at production by hand (same file, production credentials):
-- it writes nothing.
\set ON_ERROR_STOP on
begin;

\echo ''
\echo '=== views in public that bypass RLS (security_invoker not on) ==='
select '---  ' || c.relname
       || case when pg_relation_is_updatable(c.oid::regclass, false) & 28 <> 0 then ' (updatable)' else '' end
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
  and not coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false)
order by c.relname;

\echo ''
\echo '=== anon and authenticated: no INSERT, UPDATE, DELETE or TRUNCATE ==='
select case when count(*) filter (where bad) = 0 then 'PASS ' else 'FAIL ' end
       || c.relname || ' (' || r.rolname || ')'
       || coalesce(': ' || string_agg(p.priv, ', ') filter (where bad), '')
from pg_class c
cross join pg_roles r
cross join lateral (values ('insert'), ('update'), ('delete'), ('truncate')) p(priv)
cross join lateral (select has_table_privilege(r.oid, c.oid, p.priv) as bad) x
where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
  and not coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false)
  and r.rolname in ('anon', 'authenticated')
group by c.relname, r.rolname
order by c.relname, r.rolname;

\echo ''
\echo '=== public_profiles is an RLS-protected, read-only table ==='
select case when c.relkind = 'r' and c.relrowsecurity then 'PASS' else 'FAIL' end
       || ' public_profiles table has RLS'
from pg_class c where c.oid = 'public.public_profiles'::regclass;

select case when has_table_privilege(r, 'public.public_profiles', 'select') then 'PASS ' else 'FAIL ' end
       || 'public_profiles SELECT (' || r || ')'
from unnest(array['anon', 'authenticated']) r;

select case when count(*) filter (where has_table_privilege(r, 'public.public_profiles', p)) = 0
            then 'PASS' else 'FAIL' end
       || ' public_profiles has no client writes'
from unnest(array['anon', 'authenticated']) r
cross join unnest(array['insert', 'update', 'delete', 'truncate']) p;

\echo ''
\echo '=== marketing_template_stats is service-role only ==='
select case when has_table_privilege(r, 'public.marketing_template_stats', 'select') then 'FAIL ' else 'PASS ' end
       || 'marketing_template_stats not readable (' || r || ')'
from unnest(array['anon', 'authenticated']) r;

rollback;
\echo 'rolled back — nothing changed'

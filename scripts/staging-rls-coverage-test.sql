-- Every table a client role can reach has row level security switched on.
--
-- RLS is per table and off by default. A table created without
-- `alter table … enable row level security` is readable and writable in full by
-- anyone holding the publishable key, because the project's default privileges
-- give anon and authenticated ALL on every new relation. Nothing else catches
-- that: the policy tests only exercise tables someone remembered to write a
-- test for, and db:block-clause only looks at functions.
--
-- So this checks every table in the schemas the Data API serves (public,
-- graphql_public) and needs no edit when a table is added. A table passes if
-- RLS is on (with no policies, that means "no client access", which is a
-- valid choice) or if neither anon nor authenticated holds any privilege on it.
-- It does not judge whether a policy is *correct*; the other staging tests do.
--
--   pnpm run staging:test -- rls-coverage
--
-- Catalog reads only, inside a transaction that ends in rollback. It is also
-- safe to point at production by hand (same file, production credentials):
-- it writes nothing.
\set ON_ERROR_STOP on
begin;

\echo ''
\echo '=== tables a client role can reach without RLS (must be none) ==='
select '---  ' || n.nspname || '.' || c.relname
       || ' (' || string_agg(distinct r.rolname, ', ') || ')'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join pg_roles r
where n.nspname in ('public', 'graphql_public')
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
  and r.rolname in ('anon', 'authenticated')
  and (has_table_privilege(r.oid, c.oid, 'select')
       or has_table_privilege(r.oid, c.oid, 'insert')
       or has_table_privilege(r.oid, c.oid, 'update')
       or has_table_privilege(r.oid, c.oid, 'delete'))
group by n.nspname, c.relname
order by 1;

\echo ''
\echo '=== tables with RLS on and no policy (client access denied; informational) ==='
select '     ' || n.nspname || '.' || c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'graphql_public')
  and c.relkind in ('r', 'p')
  and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by 1;

do $$
declare
  exposed text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by n.nspname, c.relname)
    into exposed
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'graphql_public')
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
    and exists (
      select 1 from pg_roles r
      where r.rolname in ('anon', 'authenticated')
        and (has_table_privilege(r.oid, c.oid, 'select')
             or has_table_privilege(r.oid, c.oid, 'insert')
             or has_table_privilege(r.oid, c.oid, 'update')
             or has_table_privilege(r.oid, c.oid, 'delete'))
    );
  if exposed is not null then
    raise exception 'FAIL: RLS is off on tables anon/authenticated can reach: %', exposed;
  end if;
  raise notice 'PASS: every client-reachable table in public has RLS on';
end $$;

rollback;

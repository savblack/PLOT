# Staging migration drift repair

The [nightly drift run 38563293177](https://github.com/savblack/PLOT/actions/runs/38563293177)
checked commit `97cdd91288a487b184a32826d70c120ebc808af3` on October 14, 2026.
Production had recorded all 162 migration files in that checkout. Staging had
recorded 148. The check also found 212 objects present only in production, 144
definitions that differed, and 49 objects present only in Staging. Fourteen
table grants differed as a warning. These counts are a snapshot, not a target
for a later repair: newer migrations have since reached `main`.

The missing relations include `brevo_sync_state`, `push_tokens`,
`push_deliveries`, `title_page_index`, `title_sitemap_cache`, and `user_artwork`.
The old Staging-only policies and indexes show that its schema has also had
branch or manual changes. The drift script uses separate, fixed production and
Staging project references and compares both ledgers with the checkout. This
failure is not an environment mix-up or a reason to ignore those objects.

## Owner procedure

1. Start from a fresh `main` checkout and confirm that Staging has a recoverable
   backup. Set `PLOT_STAGING_DB_PASSWORD` through the usual private environment,
   without putting it in a command line or tracked file. Do not use the repo's
   default Supabase link for database writes; it points to Production.
2. Re-run the read-only check before planning any write:

   ```sh
   node --env-file=.env scripts/check-migration-drift.mjs
   ```

   The October 14 run lacked these versions. Recompute the list from the fresh
   output, because `main` now has more migration files:

   ```text
   20261012120000  20261012130000  20261012150000  20261012160000
   20261012170000  20261013120000  20261013180000  20261013190000
   20261014090000  20261014090100  20261014090200  20261014100000
   20261014110000  20261015100000
   ```

3. Confirm the destination and ledger through a connection explicitly configured
   for Staging (`uzrhfivnhdcfieuaxzip`). Use the Staging pooler settings in
   `scripts/staging-sql.sh`. With the password already in the private
   environment, run:

   ```sh
   : "${PLOT_STAGING_DB_PASSWORD:?Set the Staging database password first}"
   export PGHOST=aws-0-ap-southeast-2.pooler.supabase.com
   export PGUSER=postgres.uzrhfivnhdcfieuaxzip
   export PGDATABASE=postgres PGPORT=5432
   export PGPASSWORD="$PLOT_STAGING_DB_PASSWORD"
   psql -X -v ON_ERROR_STOP=1 -c 'select current_database(), current_user;'
   ```

   Then run these read-only SQL statements with the same connection before
   applying anything:

   ```sql
   select current_database(), current_user;
   select version, name
   from supabase_migrations.schema_migrations
   where version >= '20261012120000'
   order by version;
   select schemaname, tablename, policyname, cmd, roles, qual, with_check
   from pg_policies
   where schemaname in ('public', 'storage')
   order by schemaname, tablename, policyname;
   ```

   Pass that SQL to `psql -X -v ON_ERROR_STOP=1` through standard input or a
   private file. Keep query output out of public issues if it includes user data.

4. Review each unrecorded migration in timestamp order against Staging's actual
   objects and definitions. Check its prerequisites, existing data, policies,
   grants, functions, cron jobs, and storage settings. `20261013120000_rls_initplan`
   replaces several older policies and explains some of the 49 Staging-only
   objects; other extras still need individual review. Do not drop an extra
   object merely to clear the warning. Preserve the `brevo_sync_state` policy;
   this repair does not authorize changing it. Check the Brevo and push cron
   schedules before enabling them in Staging, since they can call external
   services. Do not copy feedback or abuse rows into a public issue or log.
5. For each migration whose schema change is absent, apply its reviewed SQL to
   Staging and record that exact version and filename stem in
   `supabase_migrations.schema_migrations` **in the same transaction**. Stop on
   the first error and inspect Staging before continuing. For a migration already
   applied by hand, compare every affected definition first; only then record
   its version. Never repair the ledger based on a table's existence alone.
   A version collision or a definition that differs from the reviewed file needs
   a separate reconciliation plan. Do not issue a blanket `db push`. From the
   checkout root, this is the exact transaction shape for the first missing
   version, **only after** its cron and schema effects have been reviewed:

   ```sh
   psql -X -v ON_ERROR_STOP=1 <<'SQL'
   begin;
   \i supabase/migrations/20261012120000_push_alerts.sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('20261012120000', 'push_alerts');
   commit;
   SQL
   ```

   Repeat in timestamp order with each reviewed file and its matching version
   and stem. For a verified hand-applied migration, omit `\i` and insert only
   its ledger row in a transaction. A failed `psql` command exits before commit;
   the transaction rolls back on disconnect.
6. Re-run `node --env-file=.env scripts/check-migration-drift.mjs`. Verify the
   ledger gap, missing objects, and differing definitions are resolved. Review
   the remaining Staging-only objects and table grant warnings individually;
   do not add them to an ignore list to make the job green.

No Staging apply or ledger repair was performed as part of this code change.

# Migration recovery runbook

Every migration under `supabase/migrations/` is forward-only — there are no
`down` scripts, which is normal for the Supabase CLI but means a bad migration
has no automatic undo. It also applies to PRODUCTION the moment it merges to
`main`, via the Supabase GitHub integration, with no staging gate in between.
This is the plan for when one ships broken, written for a solo operator who
won't have this memorized under pressure.

See `docs/ops/db-restore.md` for recovering lost/corrupted **data**. This doc
is for recovering from a bad **schema change** — a migration that breaks the
app, locks a table, or drops something it shouldn't have.

## 1. Confirm it's the migration

Check what actually changed and whether it's live:

```sh
git log --oneline -- supabase/migrations | head -5   # what shipped recently
npx supabase migration list                          # applied vs. pending, local vs. remote
```

If the app broke right after a merge that included a new migration file, that's
your suspect.

There is a second, quieter failure to rule out here: the migration may never
have applied at all. The Supabase integration runs *after* the push and out of
band, so when it fails the merge still goes green and nothing in the repo
notices — production just stops tracking `main`. That has happened for four and
a half days across 29 merges without anyone spotting it.
`.github/workflows/supabase-deploy-guard.yml` exists to raise the alarm — it
opens (or comments on) a labelled GitHub issue when the integration's own check
did not succeed. Check that issue and the guard's most recent run before
assuming the schema on production is the schema in `main`.

## 2. Stop the bleeding

- If the migration is mid-run and locking a table (common with `alter table`
  on a large table without `concurrently`), you may need to cancel it:
  ```sh
  psql "$SUPABASE_DB_URL" -c "select pg_cancel_backend(pid) from pg_stat_activity where query ilike '%<distinctive fragment>%';"
  ```
- If the app is erroring because it expects a column/table the migration
  removed or renamed, that's a fast partial mitigation: revert the **app**
  deploy (Cloudflare Pages/Workers rollback) while you fix the DB properly.
  App code and schema don't have to be fixed in the same step.

## 3. Write a forward-fixing migration — don't hand-edit prod

Never run ad hoc `ALTER`/`DROP` directly against `$SUPABASE_DB_URL` to patch
things. Always write a new migration file that undoes or corrects the bad
one, then apply it the normal way (§4). This keeps `supabase/migrations/` as the
single source of truth — if you patch prod by hand, local dev and any future
rebuild of the DB silently diverge from what's actually running.

Common forward-fixes:
- Bad `alter table ... add column` → new migration to `drop column if exists`.
- Bad `drop column`/`drop table` → restore the data from the pre-migration
  backup (see `db-restore.md` §3, targeted restore) and re-add the
  column/table in a new migration, then copy the data back in.
- Bad RLS policy (too permissive/too restrictive) → new migration with
  `drop policy if exists` + the corrected `create policy`.
- Bad index that's locking writes → `create index concurrently` in a new
  migration; `drop index concurrently` first if the bad one is still building.

## 4. Apply and verify

**Merge the fixing migration to `main` — that is what applies it.** The Supabase
GitHub integration picks it up from there. Do not reach for `npx supabase db
push`: this repository's default Supabase configuration is linked to Production
(see the staging section of `README.md`), so an unqualified push fires straight
at the live database, outside the migration history everything else trusts.

Then, in order:

1. Watch the deploy guard's run on that merge, or re-run it by hand
   (`gh workflow run supabase-deploy-guard.yml`). A green merge is not evidence
   the migration applied — see §1.
2. Confirm the schema is actually what you intended, against the live database
   rather than the file you just wrote:
   ```sh
   npx supabase migration list   # the fix should now show as applied remotely
   ```
3. Re-run whatever surfaced the break (reload the app, hit the affected
   endpoint) before considering it resolved.

## 5. Afterward

- Add a one-line note at the top of the fixing migration explaining what it
  corrects and why (future-you will not remember the incident).
- If the mistake was destructive (dropped a column/table with real data),
  double check the recovered data in `db-restore.md`'s scratch-DB step lines
  up before trusting the forward-fix migration.

## Prevention, cheaply

Merging is applying, so there is no dry run on the way to production. A PLOT
Staging project does exist, but `npm run supabase:staging` deliberately does not
wrap database commands, so it is not the rehearsal surface either. The cheap
rehearsal is local: before a schema change you're unsure about, apply it to a
scratch local DB first.

```sh
npx supabase db reset          # rebuilds local DB from all migrations, local only
```

If it fails or behaves unexpectedly locally, it would have on prod too — catch
it before the migration reaches `main`.

# Database restore runbook

Nightly encrypted backups live in Cloudflare R2 under `db-backups/` (see
`.github/workflows/db-backup.yml`). They cover the `public`, `auth`, `storage` and
`supabase_migrations` schemas. Retention is 30 days.

You need: the `BACKUP_GPG_PASSPHRASE` (kept in your password manager, **not** in the
repo), R2 credentials, and `pg_restore`/`psql` v17 (`brew install postgresql@17`).

> **Last verified: 2026-08-14.** Drill restored 46/46 `public` base tables with row
> counts matching Production exactly, `auth.users` at 24 rows including 14 password
> hashes, and `supabase_migrations.schema_migrations` at 81 rows. Re-run it with
> `scripts/db-restore-drill.sh` — it streams prod into a throwaway local cluster and
> destroys it afterwards, so no plaintext dump ever touches disk.

## 0. Prerequisites — do NOT skip, or the restore loses tables silently

**`pg_restore` reports failures on stderr and still exits 0.** The 2026-08-14 drill
restored what looked like a healthy database while silently dropping two tables. Both
`app_waitlist` and `marketing_subscribers` (the newsletter list) failed with
`type "public.citext" does not exist`, because `pg_dump -n public` emits no
`CREATE EXTENSION` statement. 44 tables restored instead of 46, exit code 0, no
warning unless you read stderr.

Create these in the target database **before** restoring:

```sh
# citext lives in `public` on Production, not `extensions` — match that exactly.
psql "$TARGET" -c 'create extension if not exists citext schema public;'
psql "$TARGET" -c 'create schema if not exists extensions;'
psql "$TARGET" -c 'create extension if not exists pgcrypto schema extensions;'
psql "$TARGET" -c 'create extension if not exists "uuid-ossp" schema extensions;'
# Only needed on a bare Postgres; a real Supabase project already has these.
psql "$TARGET" -c 'create schema if not exists supabase_functions;'
for r in anon authenticated service_role supabase_auth_admin supabase_storage_admin authenticator; do
  psql "$TARGET" -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r')
    then create role $r nologin; end if; end \$\$;"
done
```

Then **always** count tables after restoring, rather than trusting the exit code:

```sh
psql "$TARGET" -At -c "select count(*) from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'"   # expect 46 as of 2026-08-14
```

Two errors are expected and harmless when restoring into a bare Postgres:
`function supabase_functions.http_request() does not exist` (×2, the webhook triggers
on `feedback` and `profiles` — the function is platform-owned) and
`schema "public" already exists`.

## 1. Fetch + decrypt a snapshot

```sh
# List available snapshots
aws s3 ls s3://<bucket>/db-backups/ --endpoint-url https://<account-id>.r2.cloudflarestorage.com

# Download one
aws s3 cp s3://<bucket>/db-backups/plot-2026-06-21T031700Z.dump.gpg . \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com

# Decrypt → a pg_dump custom-format archive
gpg --batch --decrypt --passphrase "$BACKUP_GPG_PASSPHRASE" \
  -o plot.dump plot-2026-06-21T031700Z.dump.gpg
```

Use the **Session pooler** connection string (same as `SUPABASE_DB_URL`) for all
commands below — the direct host is IPv6-only.

## 2. Inspect before restoring

```sh
pg_restore -l plot.dump | less          # table of contents
```

## 3. Targeted restore (the common case)

Most incidents need one table or one row, **not** a full restore. Restore the dump
into a scratch/local Postgres, then copy out only what you need.

```sh
# Spin up a throwaway local DB and load the snapshot there
createdb plot_snapshot
pg_restore --no-owner --no-privileges -d plot_snapshot plot.dump

# Example: recover one user's overwritten password hash
psql plot_snapshot -At -c \
  "select encrypted_password from auth.users where email='someone@example.com'"
# → then apply it to prod (review carefully first):
psql "$SUPABASE_DB_URL" -c \
  "update auth.users set encrypted_password='<hash-from-snapshot>' where email='someone@example.com'"
```

(Restoring a hash lets the user log in with their **original** password again — no reset.)

## 4. Full restore (last resort)

Only when the whole DB is corrupt. This overwrites prod data — take a fresh dump
first and confirm the blast radius.

```sh
pg_restore --clean --if-exists --no-owner --no-privileges \
  -n public -n auth -n storage -d "$SUPABASE_DB_URL" plot.dump
```

## Notes
- Backups contain password hashes + PII. Delete local decrypted copies when done.
  Prefer `scripts/db-restore-drill.sh`, which pipes the dump and never writes one.
- Storage **objects** (files in buckets) are not in these dumps — only the `storage`
  schema metadata, so a database restore alone leaves avatar rows pointing at objects
  that no longer exist. The bytes are mirrored nightly by `storage-backup.yml` to
  `storage-mirror/<bucket>/<path>` in the same R2 bucket. To put them back:

  ```sh
  aws s3 sync "s3://<bucket>/storage-mirror/avatars/" ./avatars \
    --endpoint-url https://<account-id>.r2.cloudflarestorage.com
  # then re-upload with the Storage API / dashboard into the `avatars` bucket
  ```

  That mirror runs **without** `--delete` on purpose: propagating a Supabase deletion
  into the backup would destroy the copy you are keeping it for. Expect orphans.
- **Do not restore Production into Staging.** It would copy real users' emails and
  password hashes into a second, less-guarded project. Drill against a throwaway local
  cluster instead — that is what the drill script does.
- Run `scripts/db-restore-drill.sh` after any migration that adds an extension type, and
  otherwise about monthly. Update the "Last verified" line above with the result.
- ⚠️ **Dumps taken before 2026-08-14 contain a live `service_role` JWT in plaintext.**
  `on_feedback_insert` and `profiles-changed-brevo-sync` used
  `supabase_functions.http_request`, which takes the Authorization header as a literal
  trigger argument, so the key sat in the trigger DDL and therefore in every dump and any
  `pg_restore -l` output. Fixed by `20260814120000_webhook_bearer_to_vault.sql`: the
  bearer and base URL now come from Vault and the DDL carries only a function slug.

  **The fix does not un-leak the old artifacts.** Up to 30 days of dumps in R2 still
  embed that key, and it is valid until 2036. Two consequences:

  - Treat any dump dated before 2026-08-14 as carrying a full-privilege credential.
  - Rotating is still worth doing. Do **not** rotate the JWT secret — that also changes
    the `anon` key and signs every user out. This project already has `sb_publishable_*` /
    `sb_secret_*` keys and asymmetric signing keys, so the cheap path is to migrate
    consumers to the new secret key and then disable legacy keys, with no session loss.
    `internalWebhook.ts`, `notify-feedback`, `notify-signup` and `profiles-changed` assert
    `role === 'service_role'` by decoding the bearer as a JWT, and an `sb_secret_*` key is
    not a JWT — those four need updating first or they fail closed.

  To rotate the webhook bearer itself now, it is a Vault update and nothing else:

  ```sql
  delete from vault.secrets where name = 'edge_webhook_bearer';
  select vault.create_secret('<new key>', 'edge_webhook_bearer', 'Bearer for internal DB webhooks');
  ```

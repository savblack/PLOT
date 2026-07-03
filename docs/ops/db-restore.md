# Database restore runbook

Nightly encrypted backups live in Cloudflare R2 under `db-backups/` (see
`.github/workflows/db-backup.yml`). They cover the `public`, `auth`, and `storage`
schemas. Retention is 30 days.

You need: the `BACKUP_GPG_PASSPHRASE` (kept in your password manager, **not** in the
repo), R2 credentials, and `pg_restore`/`psql` v17 (`brew install postgresql@17`).

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
- Storage **objects** (files in buckets) are not in these dumps — only the `storage`
  schema metadata. File contents would need separate object-storage backup.
- Test a restore into a scratch DB periodically so the runbook is known-good.

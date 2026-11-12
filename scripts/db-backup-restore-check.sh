#!/usr/bin/env bash
# Prove that one real nightly backup restores, and fail loudly if it does not.
#
# scripts/db-restore-drill.sh checks that Production *could* be dumped and
# restored today. It never opens a file from R2, so it cannot see a problem in
# the backups themselves: a schema left out of db-backup.yml, a passphrase
# that no longer decrypts, a truncated upload. This script takes an encrypted
# backup exactly as db-backup.yml wrote it and restores that.
#
# It fails (exit 1) when:
#   - the file does not decrypt, or restores no `auth` schema;
#   - pg_restore reported an error not on the short list of known-harmless
#     ones. pg_restore exits 0 even when whole tables fail, which is how the
#     2026-08-14 drill lost two tables without a warning;
#   - a table listed in the backup's own table of contents is not in the
#     restored database;
#   - with SUPABASE_DB_URL set: a Production table is missing, a sizeable
#     table restored with under half its Production rows, or the restore has
#     fewer row-level security policies than Production. A missing policy is
#     silent in a restore, because the table is there and RLS is still on.
#
# Nothing decrypted is written to disk: gpg pipes straight into pg_restore.
# The sandbox holds real personal data while it runs and is destroyed on exit.
#
# Usage:
#   BACKUP_GPG_PASSPHRASE=... [SUPABASE_DB_URL=...] scripts/db-backup-restore-check.sh plot-<stamp>.dump.gpg
#
# Runs monthly in .github/workflows/db-backup-restore-check.yml.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/pg-sandbox.sh
. "$HERE/lib/pg-sandbox.sh"

BACKUP="${1:?usage: db-backup-restore-check.sh <backup.dump.gpg>}"
: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE is required}"
[ -s "$BACKUP" ] || { echo "✗ $BACKUP is missing or empty" >&2; exit 1; }

sandbox_require_pg17 || exit 1

decrypt() {
  # Passphrase on stdin, not argv: argv is readable by every process.
  gpg --batch --quiet --decrypt --pinentry-mode loopback --passphrase-fd 0 "$BACKUP" <<< "$BACKUP_GPG_PASSPHRASE"
}

sandbox_up || exit 1
sandbox_prereqs

FAILURES=0
fail() { echo "✗ $*"; FAILURES=$((FAILURES + 1)); }

# 1. The backup's own list of tables. "<id>; <class> <oid> TABLE <schema> <name> <owner>"
# pg_restore -l stops reading once it has the table of contents, so gpg can
# die of a closed pipe here. Judge this step by pg_restore alone.
decrypt 2>"$SANDBOX_WORK/gpg.err" | pg_restore -l > "$SANDBOX_WORK/toc" 2>"$SANDBOX_WORK/toc.err"
if [ "${PIPESTATUS[1]}" -ne 0 ] || [ ! -s "$SANDBOX_WORK/toc" ]; then
  cat "$SANDBOX_WORK/gpg.err" >> "$SANDBOX_WORK/toc.err"
  echo "✗ could not decrypt or read $BACKUP:" >&2
  sed 's/^/    /' "$SANDBOX_WORK/toc.err" >&2
  exit 1
fi
awk '$4 == "TABLE" && $5 != "DATA" { print $5 "." $6 }' "$SANDBOX_WORK/toc" | sort -u > "$SANDBOX_WORK/toc_tables"
echo "backup lists $(wc -l < "$SANDBOX_WORK/toc_tables" | tr -d ' ') tables"

# 2. Restore it.
decrypt | pg_restore --no-owner --no-privileges -d "$SANDBOX_URL" 2>"$SANDBOX_WORK/restore.err"
if ! psql "$SANDBOX_URL" -At -c "select 1 from pg_namespace where nspname = 'auth'" 2>/dev/null | grep -q 1; then
  echo "✗ the restore produced no 'auth' schema; this backup is not usable." >&2
  sed 's/^/    /' "$SANDBOX_WORK/restore.err" >&2
  exit 1
fi

# 3. Restore errors. These are expected in a bare Postgres and harmless:
#    - the public schema already exists in any new database;
#    - supabase_functions.http_request is platform-owned, so the two webhook
#      triggers that call it (feedback, profiles) cannot be created here.
#    Anything else is a real failure until someone reads it and adds it here
#    with the reason.
grep -oE 'ERROR:  .*' "$SANDBOX_WORK/restore.err" \
  | grep -vE 'schema "public" already exists' \
  | grep -vE 'function supabase_functions\.http_request\(\) does not exist' \
  | sort | uniq -c | sort -rn > "$SANDBOX_WORK/unexpected.err" || true
if [ -s "$SANDBOX_WORK/unexpected.err" ]; then
  fail "pg_restore reported errors that are not on the known-harmless list:"
  sed 's/^/    /' "$SANDBOX_WORK/unexpected.err"
fi

TABLES_SQL="select table_schema || '.' || table_name from information_schema.tables
  where table_schema in ('public','private','auth','storage','supabase_migrations') and table_type = 'BASE TABLE'
  order by 1"
psql "$SANDBOX_URL" -At -c "$TABLES_SQL" | sort -u > "$SANDBOX_WORK/restored_tables"

# 4. Every table the backup carries must have come back.
comm -23 "$SANDBOX_WORK/toc_tables" "$SANDBOX_WORK/restored_tables" > "$SANDBOX_WORK/lost"
if [ -s "$SANDBOX_WORK/lost" ]; then
  fail "tables in the backup that did not restore:"
  sed 's/^/    /' "$SANDBOX_WORK/lost"
fi

COUNT_SQL="select table_schema || '.' || table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema in ('public','private','auth','storage','supabase_migrations') and table_type = 'BASE TABLE'
order by 1"
POLICY_SQL="select count(*) from pg_policies where schemaname in ('public','private','storage')"
LATEST_SQL="select coalesce(max(version), '') from supabase_migrations.schema_migrations"

psql "$SANDBOX_URL" -At -F' ' -c "$COUNT_SQL" | sort > "$SANDBOX_WORK/restored_counts"
RESTORED_POLICIES=$(psql "$SANDBOX_URL" -At -c "$POLICY_SQL")
BACKUP_LATEST=$(psql "$SANDBOX_URL" -At -c "$LATEST_SQL")
echo "restored: $(wc -l < "$SANDBOX_WORK/restored_tables" | tr -d ' ') tables, $RESTORED_POLICIES policies, latest migration $BACKUP_LATEST"

# 5. Against Production, when it can be read. Read-only.
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  PLOT_DB_CONNINFO="$SUPABASE_DB_URL" node "$HERE/write-pg-service.mjs" "$SANDBOX_WORK/prod_service.conf" plot_production
  # The sandbox exports its own PGPASSWORD; drop it so the service file's applies.
  prod() { env -u PGPASSWORD PGSERVICEFILE="$SANDBOX_WORK/prod_service.conf" PGSERVICE=plot_production psql -At "$@"; }
  prod -c "$TABLES_SQL" | sort -u > "$SANDBOX_WORK/prod_tables"
  prod -F' ' -c "$COUNT_SQL" | sort > "$SANDBOX_WORK/prod_counts"
  PROD_POLICIES=$(prod -c "$POLICY_SQL")
  PROD_LATEST=$(prod -c "$LATEST_SQL")
  if [ ! -s "$SANDBOX_WORK/prod_tables" ]; then
    fail "could not read Production to compare against"
  else
    echo "production: $(wc -l < "$SANDBOX_WORK/prod_tables" | tr -d ' ') tables, $PROD_POLICIES policies, latest migration $PROD_LATEST"
    # A migration applied after the backup was taken can legitimately add a
    # table or a policy the backup does not have yet. Only then are those
    # differences a note rather than a failure.
    SAME_SCHEMA=1
    [ "$PROD_LATEST" = "$BACKUP_LATEST" ] || SAME_SCHEMA=0

    comm -23 "$SANDBOX_WORK/prod_tables" "$SANDBOX_WORK/restored_tables" > "$SANDBOX_WORK/missing"
    if [ -s "$SANDBOX_WORK/missing" ]; then
      if [ "$SAME_SCHEMA" = 1 ]; then
        fail "Production tables missing from the restore:"
      else
        echo "note: Production has migrations newer than the backup; these tables are not in it yet:"
      fi
      sed 's/^/    /' "$SANDBOX_WORK/missing"
    fi

    if [ "$RESTORED_POLICIES" -lt "$PROD_POLICIES" ]; then
      if [ "$SAME_SCHEMA" = 1 ]; then
        fail "the restore has $RESTORED_POLICIES security policies; Production has $PROD_POLICIES"
      else
        echo "note: $RESTORED_POLICIES policies restored vs $PROD_POLICIES on Production, which has newer migrations"
      fi
    fi

    # A backup is up to a day old, so counts differ a little. A sizeable table
    # with under half its rows means rows were lost, not that time passed.
    join "$SANDBOX_WORK/prod_counts" "$SANDBOX_WORK/restored_counts" \
      | awk '$2 >= 50 && $3 * 2 < $2 { print "    " $1 ": " $3 " restored, " $2 " on Production" }' \
      > "$SANDBOX_WORK/short"
    if [ -s "$SANDBOX_WORK/short" ]; then
      fail "tables that restored with under half their Production rows:"
      cat "$SANDBOX_WORK/short"
    fi
  fi
else
  echo "SUPABASE_DB_URL not set: skipped the comparison with Production"
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "BACKUP RESTORE CHECK FAILED ($FAILURES problem(s)) for $(basename "$BACKUP")"
  exit 1
fi
echo "BACKUP RESTORE CHECK OK for $(basename "$BACKUP")"

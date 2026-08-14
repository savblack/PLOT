#!/usr/bin/env bash
# Restore drill: prove the nightly backup is actually restorable.
#
# Streams a fresh pg_dump of Production straight into a throwaway local
# Postgres 17 cluster and reports row counts. Nothing unencrypted is ever
# written to disk — the dump is piped, never stored — and the cluster is
# destroyed at the end, because it contains real password hashes and PII.
#
# WHY THIS EXISTS: the runbook was untested for six weeks, and the first drill
# (2026-08-14) found that two tables silently failed to restore. pg_restore
# reports such failures on stderr and still exits 0, so a restore can look
# fine and quietly lose tables. This script makes that check repeatable.
#
# Usage:
#   set -a; . .env; set +a          # from the MAIN checkout
#   scripts/db-restore-drill.sh
#
# Requires: brew install postgresql@17   (Production is PG17; pg_dump 16 refuses
# to dump a newer server, and macOS ships 16 via postgresql@16.)
#
# See also scripts/db-migration-test.sh, which reuses the same sandbox to apply
# pending migrations to a copy of production before you merge them.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/pg-sandbox.sh
. "$HERE/lib/pg-sandbox.sh"

sandbox_require_pg17 || exit 1
PROD_URL="$(sandbox_prod_url)" || exit 1

sandbox_up || exit 1
sandbox_prereqs
sandbox_restore_prod "$PROD_URL"

COUNT_SQL="select table_schema||'.'||table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema in ('public','auth','supabase_migrations') and table_type='BASE TABLE'
order by 1"

psql "$SANDBOX_URL" -At -F',' -c "$COUNT_SQL" > "$SANDBOX_WORK/local.csv"
LOCAL_TABLES=$(psql "$SANDBOX_URL" -At -c \
  "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")

echo
echo "public base tables restored: $LOCAL_TABLES"
echo
echo "--- restore errors, deduplicated (pg_restore exits 0 even with these) ---"
grep -oE 'ERROR:  .*' "$SANDBOX_WORK/restore.err" | sort | uniq -c | sort -rn || echo "(none)"
echo
echo "--- restored row counts ---"
column -s, -t < "$SANDBOX_WORK/local.csv"
echo
echo "Compare the counts above against Production. Any table present on prod but"
echo "missing here is a silent restore failure — investigate before trusting the backup."

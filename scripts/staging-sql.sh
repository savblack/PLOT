#!/usr/bin/env bash
# Run a .sql file against the PLOT Staging project and summarise its PASS/FAIL
# lines.
#
# Staging only. The project ref is fixed below; there is no flag to point this
# at production, deliberately.
#
# Scripts run through this are expected to wrap themselves in a transaction that
# ends in `rollback`, so Staging is unchanged whether they pass or die partway.
# A teardown block at the bottom of a script does not run when the script dies
# above it — which is how a previous run left a profile public and a block row
# behind on Staging.
#
# Usage:
#   set -a; . .env; set +a          # from the MAIN checkout
#   scripts/staging-sql.sh scripts/staging-premium-flag-test.sql
#
# Requires: brew install postgresql@17
set -uo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

STAGING_REF=uzrhfivnhdcfieuaxzip
FILE="${1:?usage: staging-sql.sh <file.sql>}"

if [ -z "${PLOT_STAGING_DB_PASSWORD:-}" ]; then
  echo "Set PLOT_STAGING_DB_PASSWORD in the MAIN checkout's .env." >&2
  echo "It is on https://supabase.com/dashboard/project/$STAGING_REF/settings/database" >&2
  exit 1
fi

# The pooler, not db.<ref>.supabase.co: the direct host is IPv6-only and
# unreachable from plenty of machines. The region prefix is per-project and is
# not derivable from the ref — Staging is ap-southeast-2 while production is
# ap-south-1. A wrong one fails fast with "(ENOTFOUND) tenant/user not found".
export PGHOST="${PLOT_STAGING_POOLER_HOST:-aws-0-ap-southeast-2.pooler.supabase.com}"
export PGUSER="postgres.$STAGING_REF"
export PGPASSWORD="$PLOT_STAGING_DB_PASSWORD"
export PGDATABASE=postgres
export PGPORT=5432
export PGCONNECT_TIMEOUT=10

out="$(psql -tA -f "$FILE" 2>&1)"
status=$?

printf '%s\n' "$out" | grep -E 'PASS|FAIL|REPRO|^===|^---|rolled back|ERROR' | sed 's/^psql:[^ ]* //' || true

passed="$(printf '%s\n' "$out" | grep -c 'PASS ' || true)"
failed="$(printf '%s\n' "$out" | grep -c 'FAIL ' || true)"

echo
if [ "$status" -ne 0 ] || [ "$failed" -gt 0 ]; then
  echo "✗ $failed of $((passed + failed)) checks FAILED on Staging."
  echo "  The transaction rolled back, so Staging is unchanged — but do not merge."
  exit 1
fi
echo "✓ all $passed checks passed on Staging"

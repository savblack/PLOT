#!/usr/bin/env bash
# Prove on STAGING that a block actually hides identity — the check no static
# gate can make.
#
# WHY: db:migration-test proves the SQL parses. db:block-clause proves the
# clause is present in the latest definition of every identity function.
# Neither executes a policy or an RPC under a real auth.uid(), so neither can
# tell you whether blocking WORKS. This runs the whole thing as three different
# authenticated users plus an anonymous reader and asserts all four outcomes.
#
# It is also the only check that can catch the opposite failure — a clause that
# is too broad and hides people who are not blocked — which is why a third
# account and an anonymous reader are in here alongside the two that block.
#
# Staging only. The project ref is fixed below; there is no flag to point this
# at production, deliberately.
#
# Everything runs in ONE transaction that ends in ROLLBACK. The previous run of
# a test like this died partway and left a profile public and a block row behind
# on Staging. A teardown block at the bottom of a script does not run when the
# script dies above it; an aborted transaction cleans itself up either way.
#
# Usage:
#   set -a; . .env; set +a          # from the MAIN checkout
#   npm run staging:block-test
#
# Requires: brew install postgresql@17
set -euo pipefail

STAGING_REF=uzrhfivnhdcfieuaxzip
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

out="$(psql -tA -f "$HERE/staging-block-test.sql" 2>&1)"
status=$?

printf '%s\n' "$out" | grep -E 'PASS|FAIL|^===|^---|rolled back|ERROR' || true

passed="$(printf '%s\n' "$out" | grep -c 'PASS ' || true)"
failed="$(printf '%s\n' "$out" | grep -c 'FAIL ' || true)"

echo
if [ "$status" -ne 0 ] || [ "$failed" -gt 0 ]; then
  echo "✗ $failed of $((passed + failed)) block checks FAILED on Staging."
  echo "  The transaction rolled back, so Staging is unchanged — but do not merge."
  exit 1
fi
echo "✓ all $passed block checks passed on Staging (blocker, blocked, bystander, anon)"

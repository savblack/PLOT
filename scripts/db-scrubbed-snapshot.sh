#!/usr/bin/env bash
# Build the scrubbed database snapshot: restore production into a throwaway
# sandbox, remove personal data with scripts/lib/scrub-pii.sql, and write a
# pg_dump of the result. The sandbox (which held real data) is torn down; only
# the scrubbed dump survives. Run by .github/workflows/db-scrubbed-snapshot.yml.
#
# Usage: SOURCE_DB_URL=... bash scripts/db-scrubbed-snapshot.sh OUT_FILE
#   SOURCE_DB_URL defaults to production (sandbox_prod_url). Point it at
#   Staging to rehearse without touching production.
# The scrub's final check fails the run if anything email-shaped survives, and
# no dump is written in that case.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/pg-sandbox.sh
. "$HERE/lib/pg-sandbox.sh"

OUT="${1:?usage: db-scrubbed-snapshot.sh OUT_FILE}"
rm -f "$OUT"

sandbox_require_pg17 || exit 1
SRC="${SOURCE_DB_URL:-}"
if [ -z "$SRC" ]; then SRC="$(sandbox_prod_url)" || exit 1; fi

sandbox_up || exit 1
sandbox_prereqs
sandbox_stub_supabase_platform
sandbox_restore_prod "$SRC" || exit 1

echo "== scrub"
if ! psql "$SANDBOX_URL" -X -q -v ON_ERROR_STOP=1 -f "$HERE/lib/scrub-pii.sql" >"$SANDBOX_WORK/scrub.out" 2>&1; then
  # Only the scrub's own messages; never row data.
  grep -E 'SCRUB|ERROR' "$SANDBOX_WORK/scrub.out" >&2
  echo "✗ scrub failed; no snapshot written" >&2
  exit 1
fi
grep -E 'rewritten|placeholder|nulled|emptied|SCRUB' "$SANDBOX_WORK/scrub.out"

pg_dump -Fc --no-owner --no-privileges \
  -n public -n private -n auth -n storage -n supabase_migrations \
  -f "$OUT" "$SANDBOX_URL" || { echo "✗ dump of the scrubbed sandbox failed" >&2; rm -f "$OUT"; exit 1; }
echo "✓ scrubbed snapshot written: $(du -h "$OUT" | cut -f1)"

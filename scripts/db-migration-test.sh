#!/usr/bin/env bash
# Apply this branch's pending migrations to a throwaway copy of PRODUCTION.
#
# WHY: merging a migration to main applies it to production automatically, and
# the only existing gates — `npm run migrations:check` and `npm run
# db:write-paths` — are static; neither executes any SQL. So the first time a
# migration actually runs is on real user data. Supabase preview branches would
# close that gap for ~$30-40/month and were ruled out on cost.
#
# This closes it for nothing: restore last night's schema+data into a local
# Postgres 17 cluster, apply whatever is pending, and see what breaks. Run it
# before merging anything under supabase/migrations/.
#
# Usage:
#   set -a; . .env; set +a          # from the MAIN checkout
#   scripts/db-migration-test.sh
#
# Requires: brew install postgresql@17
#
# FIDELITY LIMITS — read these before trusting a pass:
#   * Vault and pg_net are stubbed (they are Supabase-only). SQL correctness is
#     tested; actual decryption and actual HTTP delivery are not.
#   * RLS policies are created but not exercised — this does not prove a policy
#     is correct, only that it parses and its columns exist.
#   * Anything depending on real auth.uid() context needs the Staging project.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/pg-sandbox.sh
. "$HERE/lib/pg-sandbox.sh"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-$HERE/../supabase/migrations}"

sandbox_require_pg17 || exit 1
PROD_URL="$(sandbox_prod_url)" || exit 1

sandbox_up || exit 1
sandbox_prereqs
sandbox_stub_supabase_platform
sandbox_restore_prod "$PROD_URL"

# What production has already applied, straight from the restored history.
applied="$(psql "$SANDBOX_URL" -At -c \
  "select version from supabase_migrations.schema_migrations order by version" 2>/dev/null)"
applied_count="$(printf '%s\n' "$applied" | grep -c . || true)"
echo "production has applied $applied_count migrations"

pending=()
for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$f" ] || continue
  version="$(basename "$f" | cut -d_ -f1)"
  if ! printf '%s\n' "$applied" | grep -qx "$version"; then
    pending+=("$f")
  fi
done

if [ "${#pending[@]}" -eq 0 ]; then
  echo
  echo "No pending migrations on this branch — nothing to test."
  exit 0
fi

echo
echo "pending on this branch (${#pending[@]}):"
for f in "${pending[@]}"; do echo "  $(basename "$f")"; done

# Seed the stubbed Vault with the secrets migrations expect to find. Real values
# are irrelevant here and deliberately fake — this proves the SQL path, and no
# production credential is involved.
psql "$SANDBOX_URL" -At -q -o /dev/null -c \
  "select vault.create_secret('sandbox-not-a-real-key', 'edge_webhook_bearer', 'stub');
   select vault.create_secret('https://sandbox.invalid', 'edge_webhook_base_url', 'stub');" 2>/dev/null

echo
failed=0
for f in "${pending[@]}"; do
  name="$(basename "$f")"
  version="$(echo "$name" | cut -d_ -f1)"

  # Supabase-only extensions have no control file in a vanilla Postgres, so
  # `create extension pg_net` fails here for reasons that say nothing about the
  # migration. The schemas they provide are already stubbed above, so neutralise
  # just those statements — and say so, because a silent rewrite would make this
  # tool lie about what it tested.
  prepared="$SANDBOX_WORK/$name"
  python3 - "$f" "$prepared" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
PLATFORM_ONLY = r'pg_net|supabase_vault|pgsodium|pg_cron|pg_graphql|pgjwt|wrappers'
out, skipped = [], []
for line in open(src):
    if re.search(r'create\s+extension', line, re.I) and re.search(PLATFORM_ONLY, line, re.I):
        skipped.append(line.strip())
        out.append('-- [sandbox] neutralised: ' + line.strip() + '\n')
    else:
        out.append(line)
open(dst, 'w').writelines(out)
for s in skipped:
    print('          [sandbox] skipped platform-only statement: ' + s[:90])
PY

  # ON_ERROR_STOP + a single transaction per migration matches how Supabase
  # applies them: a partial migration must not be reported as a pass.
  if err="$(psql "$SANDBOX_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "$prepared" 2>&1)"; then
    psql "$SANDBOX_URL" -q -c \
      "insert into supabase_migrations.schema_migrations (version) values ('$version')
       on conflict do nothing;" 2>/dev/null
    echo "  PASS  $name"
  else
    failed=$((failed + 1))
    echo "  FAIL  $name"
    printf '%s\n' "$err" | sed 's/^/          /' | head -12
  fi
done

echo
if [ "$failed" -gt 0 ]; then
  echo "$failed of ${#pending[@]} pending migration(s) FAILED against a copy of production."
  echo "Merging as-is would apply them to real user data and stall every later migration."
  exit 1
fi

echo "All ${#pending[@]} pending migration(s) applied cleanly to a copy of production."
echo "Reminder: Vault and pg_net are stubbed, and RLS policies are not exercised."

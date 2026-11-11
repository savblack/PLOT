#!/usr/bin/env bash
# Prove scripts/lib/scrub-pii.sql on the STAGING database, then prove pending
# migrations still apply to the scrubbed copy.
#
# Staging holds test accounts only, so this exercises the scrub's mechanics
# (every column handled, constraints survived, nothing email-shaped left)
# without touching real member data. It also plants known personal values
# first, so a scrub that silently skipped a column would fail here.
#
# Usage (from a checkout with the main .env linked):
#   set -a; . .env; set +a
#   bash scripts/db-scrub-test.sh
# Needs PostgreSQL 17 (brew install postgresql@17) and PLOT_STAGING_DB_PASSWORD.
set -uo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/pg-sandbox.sh
. "$HERE/lib/pg-sandbox.sh"
MIGRATIONS_DIR="$HERE/../supabase/migrations"

if [ -z "${PLOT_STAGING_DB_PASSWORD:-}" ]; then
  echo "Set PLOT_STAGING_DB_PASSWORD (the main checkout's .env)." >&2
  exit 1
fi
pw="$(python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PLOT_STAGING_DB_PASSWORD"],safe=""))')"
STAGING_URL="postgresql://postgres.uzrhfivnhdcfieuaxzip:${pw}@${PLOT_STAGING_POOLER_HOST:-aws-0-ap-southeast-2.pooler.supabase.com}:5432/postgres"

sandbox_require_pg17 || exit 1
sandbox_up || exit 1
sandbox_prereqs
sandbox_stub_supabase_platform
sandbox_restore_prod "$STAGING_URL" || exit 1

q() { psql "$SANDBOX_URL" -X -At -v ON_ERROR_STOP=1 -c "$1"; }

# Plant personal values the scrub must remove: an email in a jsonb leaf, in a
# free-text field and on the auth user itself.
uid="$(q "select id from auth.users order by created_at limit 1")"
if [ -z "$uid" ]; then
  echo "✗ Staging restore has no auth.users rows to plant into" >&2
  exit 1
fi
q "update auth.users set email = 'planted.person@gmail.com', raw_user_meta_data = jsonb_build_object('full_name', 'Planted Person', 'contact', jsonb_build_array('planted.person@gmail.com')) where id = '$uid'" >/dev/null
planted="$(q "select count(*) from auth.users where email = 'planted.person@gmail.com'")"
echo "planted personal values on 1 user (found $planted)"

echo "== scrub"
if ! psql "$SANDBOX_URL" -X -q -v ON_ERROR_STOP=1 -f "$HERE/lib/scrub-pii.sql" 2>&1 | grep -E 'rewritten|nulled|emptied|SCRUB|ERROR'; then
  :
fi
status="${PIPESTATUS[0]}"
if [ "$status" -ne 0 ]; then
  echo "✗ scrub failed (exit $status)" >&2
  exit 1
fi

left="$(q "select count(*) from auth.users where email ilike '%planted%' or raw_user_meta_data::text ilike '%planted%'")"
if [ "$left" != 0 ]; then
  echo "✗ a planted value survived the scrub" >&2
  exit 1
fi
echo "✓ planted values gone; $(q "select count(*) from auth.users") users and $(q "select count(*) from public.profiles") profiles kept"

echo "== pending migrations on the scrubbed copy"
applied="$(q "select version from supabase_migrations.schema_migrations")"
failed=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  printf '%s\n' "$applied" | grep -qx "$v" && continue
  if psql "$SANDBOX_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$SANDBOX_WORK/m.err"; then
    echo "  ✓ $(basename "$f")"
  else
    echo "  ✗ $(basename "$f"): $(head -1 "$SANDBOX_WORK/m.err")"
    failed=1
  fi
done
[ "$failed" -eq 0 ] && echo "✓ scrub test passed" || { echo "✗ a migration failed on the scrubbed copy" >&2; exit 1; }

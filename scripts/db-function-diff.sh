#!/usr/bin/env bash
# Show exactly what this branch's pending migrations change inside each
# function they redefine — line by line, against PRODUCTION's live body.
#
# WHY: `create or replace function` replaces the whole body. You do not amend a
# function, you retype it, and whatever the previous author fixed is silently
# yours to lose. That is how 20260725000001 reverted a conflict target and broke
# every history write for two weeks (scripts/check-migration-redefinitions.mjs
# has the full story). That guard catches the one detail that broke; this
# catches the general case by showing you the diff and making you look at it.
#
# db:migration-test answers "does it apply?". This answers "did I change only
# what I meant to?" — which for a redefinition is the question that matters, and
# the one a passing migration test cannot reach.
#
# Usage:
#   set -a; . .env; set +a          # from the MAIN checkout
#   npm run db:function-diff
#
# Requires: brew install postgresql@17
#
# Not a CI gate, deliberately: it needs production credentials, and its output
# is a diff for a human to read, not a pass/fail. Run it before opening any PR
# that contains `create or replace function`.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/pg-sandbox.sh
. "$HERE/lib/pg-sandbox.sh"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-$HERE/../supabase/migrations}"

# One row per function: name, then the body with newlines escaped, so a snapshot
# is greppable by name and restorable line-by-line for diffing.
SNAPSHOT_SQL="select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                     || E'\t' || replace(pg_get_functiondef(p.oid), E'\n', '\\n')
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prokind = 'f'
               order by 1"

sandbox_require_pg17 || exit 1
PROD_URL="$(sandbox_prod_url)" || exit 1

sandbox_up || exit 1
sandbox_prereqs
sandbox_stub_supabase_platform
sandbox_restore_prod "$PROD_URL" || exit 1

applied="$(psql "$SANDBOX_URL" -At -c \
  "select version from supabase_migrations.schema_migrations order by version" 2>/dev/null)"

pending=()
for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$f" ] || continue
  version="$(basename "$f" | cut -d_ -f1)"
  printf '%s\n' "$applied" | grep -qx "$version" || pending+=("$f")
done

if [ "${#pending[@]}" -eq 0 ]; then
  echo
  echo "No pending migrations on this branch — nothing to diff."
  exit 0
fi

echo
echo "pending on this branch (${#pending[@]}):"
for f in "${pending[@]}"; do echo "  $(basename "$f")"; done

psql "$SANDBOX_URL" -At -q -o /dev/null -c \
  "select vault.create_secret('sandbox-not-a-real-key', 'edge_webhook_bearer', 'stub');
   select vault.create_secret('https://sandbox.invalid', 'edge_webhook_base_url', 'stub');" 2>/dev/null

psql "$SANDBOX_URL" -At -c "$SNAPSHOT_SQL" > "$SANDBOX_WORK/before.tsv" 2>/dev/null

for f in "${pending[@]}"; do
  if ! err="$(psql "$SANDBOX_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "$f" 2>&1)"; then
    echo
    echo "✗ $(basename "$f") did not apply, so there is nothing to diff." >&2
    printf '%s\n' "$err" | sed 's/^/    /' | head -12 >&2
    echo "  Fix it with npm run db:migration-test first." >&2
    exit 1
  fi
done

psql "$SANDBOX_URL" -At -c "$SNAPSHOT_SQL" > "$SANDBOX_WORK/after.tsv" 2>/dev/null

echo
python3 - "$SANDBOX_WORK/before.tsv" "$SANDBOX_WORK/after.tsv" <<'PY'
import difflib, sys

def load(path):
    out = {}
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if '\t' not in line:
            continue
        name, body = line.split('\t', 1)
        out[name] = body.replace('\\n', '\n')
    return out

before, after = load(sys.argv[1]), load(sys.argv[2])

added    = [n for n in after if n not in before]
removed  = [n for n in before if n not in after]
changed  = [n for n in after if n in before and before[n] != after[n]]

if not (added or removed or changed):
    print('No function bodies changed.')
    sys.exit(0)

for name in sorted(added):
    print(f'NEW      {name}')
for name in sorted(removed):
    print(f'DROPPED  {name}')
if added or removed:
    print()

if not changed:
    sys.exit(0)

print(f'{len(changed)} function(s) REDEFINED. Every line below is a line you are')
print('replacing in production. Read each one.')
print()

total_removed = 0
for name in sorted(changed):
    print('─' * 78)
    print(name)
    print('─' * 78)
    diff = list(difflib.unified_diff(
        before[name].splitlines(), after[name].splitlines(),
        fromfile='production', tofile='this branch', lineterm='', n=2))
    for line in diff:
        print('  ' + line)
        if line.startswith('-') and not line.startswith('---'):
            total_removed += 1
    print()

print('═' * 78)
print(f'{total_removed} line(s) removed from live function bodies across {len(changed)} function(s).')
print('A redefinition that only ADDS lines is the safe shape. Anything under a')
print('"-" is behaviour that exists in production right now and will not after')
print('this merges — confirm each one is deliberate.')
PY

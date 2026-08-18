#!/usr/bin/env bash
# Type-check every Supabase edge function against the generated DB types.
#
# WHY THIS EXISTS
# `deno check` used to report 130 errors across 7 of the 21 functions, and
# nothing gated on it, so nobody knew. Almost all of them came from one mistake:
# helper parameters typed `ReturnType<typeof createClient>`, which is the
# *default* generic instantiation — SupabaseClient<unknown, …, never, never>.
# With the schema typed `never`, every `.from(…).select()` row was `never` too, so
# `row.id` was an error, inserts were errors, and the real client was not even
# assignable to the parameter. Once that was fixed the residue was genuine: rows
# with a nullable title or media_type being written into NOT NULL columns, which
# fails at runtime with 23502 and takes the whole batch with it.
#
# Edge functions are hand-deployed, so a type error here is not caught by any
# build — this script is the only thing standing between a bad assumption and a
# silently failing sync.
#
# --node-modules-dir=none is not optional. The repo is an npm workspace, so Deno
# otherwise finds node_modules/ in an ancestor, switches to node resolution and
# gives up on every npm: specifier ("Could not find a matching package for
# npm:stripe"). Four functions failed that way and so were never type-checked at
# all — the flag is what makes the check cover them.
#
# deno.lock is committed so this check is reproducible — a new supabase-js 2.x
# release cannot turn CI red on its own. It pins only what the *type check*
# resolves; the deployed function resolves its own versions in Supabase's runtime,
# which is why the lock is not a deployment artifact.
#
# Usage: npm run edge:check   (needs deno on PATH: https://deno.land)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

if ! command -v deno > /dev/null 2>&1; then
  echo "deno is not installed — skipping edge function typecheck." >&2
  echo "Install it from https://deno.land, or let CI run this." >&2
  exit 1
fi

failed=0
checked=0

for dir in supabase/functions/*/; do
  entry="${dir}index.ts"
  [ -f "$entry" ] || continue
  checked=$((checked + 1))
  name=$(basename "$dir")

  if output=$(deno check --node-modules-dir=none "$entry" 2>&1); then
    printf '  ✓ %s\n' "$name"
  else
    printf '  ✗ %s\n' "$name"
    echo "$output" | sed 's/^/      /'
    failed=$((failed + 1))
  fi
done

echo ""
if [ "$failed" -eq 0 ]; then
  echo "✓ ${checked} edge function(s) typecheck clean"
  exit 0
fi

cat >&2 <<'MSG'
✗ edge function typecheck failed.

If the errors name columns that do exist, the generated types are stale — the
schema moved and supabase/functions/_shared/database.types.ts did not. Refresh it:

    npm run gen:db-types

If they name a nullable value going into a NOT NULL column, that is a real
runtime failure waiting to happen (Postgres 23502 aborts the whole statement),
not a typing nuisance — narrow the value instead of casting it away.
MSG
exit 1

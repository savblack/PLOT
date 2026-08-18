#!/usr/bin/env bash
# Lint and type-check the Supabase Edge Functions.
#
# WHY THIS EXISTS: nothing checked supabase/functions/ at all. CI has no Deno
# step, and Supabase deploys a function without type-checking it, so the first
# time an edge function was verified was when a user hit it. That is how 17
# functions came to read an environment variable that was about to stop working
# (see _shared/serviceKey.ts) with nothing to flag it.
#
# DENO_NO_PACKAGE_JSON is required, not incidental. Without it Deno finds the
# monorepo's root package.json, tries to resolve the whole workspace — expo and
# all — and fails on unrelated dependency resolution before it ever looks at a
# function. The functions are standalone Deno modules; they should not see npm
# workspace config.
set -uo pipefail
export DENO_NO_PACKAGE_JSON=1

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

if ! command -v deno >/dev/null 2>&1; then
  echo "deno not found. Install with: brew install deno" >&2
  exit 1
fi

# ── Type-check baseline ──────────────────────────────────────────────────────
# These functions do not type-check yet: 130 errors between them, all predating
# this script. They are excluded so the other 13 functions can be enforced
# today rather than waiting on a cleanup.
#
# This is a ratchet, not a permanent exemption. The check below fails if a
# listed file starts passing, so the list can only shrink. Fix a function, drop
# its line.
BASELINE=(
  supabase/functions/admin-review/index.ts                  # 16 errors
  supabase/functions/marketing-feed/index.ts                #  8
  supabase/functions/media-sync/index.ts                    # 52
  supabase/functions/notify-feedback/index.ts               #  5
  supabase/functions/signup-bypass/index.ts                 #  1
  supabase/functions/trakt-sync/index.ts                    # 39
  supabase/functions/watch-availability/index.ts            #  2
  supabase/functions/watchlist-availability-alerts/index.ts #  7
)

is_baselined() {
  local f
  for f in "${BASELINE[@]}"; do
    [ "$f" = "$1" ] && return 0
  done
  return 1
}

fail=0

# ── Lint ────────────────────────────────────────────────────────────────────
# Two rules are off, both deliberately:
#   no-import-prefix — edge functions are written with npm:/jsr:/https:
#     specifiers. That is the platform's model, not a mistake to fix.
#   no-explicit-any  — 9 pre-existing instances; excluded so the rest of the
#     ruleset can be enforced now.
# Everything else is on, which is what catches a bad import or a syntax error
# before deploy.
echo "── deno lint ──"
if deno lint --rules-exclude=no-import-prefix,no-explicit-any supabase/functions; then
  echo "  lint clean"
else
  echo "  lint FAILED" >&2
  fail=1
fi

# ── Type-check ──────────────────────────────────────────────────────────────
echo
echo "── deno check ──"
checked=0
skipped=0
unexpected_pass=()

while IFS= read -r f; do
  if is_baselined "$f"; then
    # Still run it, to notice when it starts passing.
    if deno check "$f" >/dev/null 2>&1; then
      unexpected_pass+=("$f")
    fi
    skipped=$((skipped + 1))
    continue
  fi
  if deno check "$f" >/tmp/edge-check.out 2>&1; then
    checked=$((checked + 1))
  else
    echo "  FAILED: $f" >&2
    tail -20 /tmp/edge-check.out >&2
    fail=1
  fi
done < <(find supabase/functions -name '*.ts' \
           \( -path '*/index.ts' -o -path '*/_shared/*' \) | sort)

echo "  type-checked $checked file(s); $skipped baselined"

if [ ${#unexpected_pass[@]} -gt 0 ]; then
  echo
  echo "These files now type-check but are still in the BASELINE list:" >&2
  for f in "${unexpected_pass[@]}"; do echo "  $f" >&2; done
  echo "Remove them from BASELINE in $0 — the ratchet only tightens." >&2
  fail=1
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "Edge functions OK."
else
  echo "Edge function checks failed." >&2
fi
exit "$fail"

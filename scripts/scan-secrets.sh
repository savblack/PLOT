#!/usr/bin/env bash
#
# Scans changed lines for secret-shaped strings. Shared by .githooks/pre-commit
# (staged diff, local) and .github/workflows/ci.yml (full PR diff) so the
# pattern list can't drift between the two — a fresh clone that never ran
# `git config core.hooksPath .githooks` still gets caught in CI.
#
# Usage: scan-secrets.sh <git-diff-args...>   e.g. --cached, or <base> <head>
set -euo pipefail

patterns='eyJhbGciOiJ|-----BEGIN[A-Z ]*PRIVATE KEY-----|service_role|PGPASSWORD=|sk_live_|rk_live_|whsec_|sk-ant-|AKIA[0-9A-Z]{16}|re_[A-Za-z0-9]{20,}|xkeysib-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{35}|api_key=[0-9a-f]{32}'
# .env.example holds placeholders by design; this script and the hook that
# calls it necessarily contain the patterns they scan for.
exclude='\.env\.example|\.githooks/pre-commit|scripts/scan-secrets\.sh'

changed=$(git diff "$@" --name-only --diff-filter=ACM | grep -vxE "$exclude" || true)
[ -z "$changed" ] && exit 0

found=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  # Only newly-added lines, ignore the diff's own +++ header.
  match=$(git diff "$@" -U0 -- "$file" \
            | grep '^+' | grep -v '^+++' \
            | grep -nEi "$patterns" || true)
  if [ -n "$match" ]; then
    if [ "$found" -eq 0 ]; then
      echo "Possible secret in changed lines:" >&2
      echo "" >&2
    fi
    echo "  $file" >&2
    echo "$match" | sed 's/^/    /' >&2
    found=1
  fi
done <<< "$changed"

if [ "$found" -eq 1 ]; then
  echo "" >&2
  echo "Move the value into .env (gitignored) and reference it via env var." >&2
  echo "If this is a false positive, a human should re-run with --no-verify locally." >&2
  exit 1
fi

exit 0

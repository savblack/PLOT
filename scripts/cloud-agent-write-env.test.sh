#!/usr/bin/env bash
# Proves scripts/cloud-agent-write-env.sh writes injected values, falls back
# to placeholders, and never dumps secret values on stdout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/cloud-agent-write-env.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# Placeholders when nothing is injected.
unset VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_TMDB_PROXY_URL VITE_TURNSTILE_SITE_KEY
PLOT_ENV_FILE="$TMP/empty.env" "$SCRIPT" >"$TMP/out.empty" 2>"$TMP/err.empty"
grep -qx 'VITE_SUPABASE_URL=https://placeholder.supabase.co' "$TMP/empty.env" \
  || fail "expected placeholder supabase url"
[ ! -s "$TMP/out.empty" ] || fail "script printed to stdout (must stay silent)"

# Injected values win, and are mirrored to SUPABASE_*.
export VITE_SUPABASE_URL='https://uzrhfivnhdcfieuaxzip.supabase.co'
export VITE_SUPABASE_ANON_KEY='sb_publishable_testkey'
export VITE_TMDB_PROXY_URL='https://tmdb-proxy-staging.sav-black.workers.dev'
export VITE_TURNSTILE_SITE_KEY='0xTEST'
PLOT_ENV_FILE="$TMP/full.env" "$SCRIPT" >"$TMP/out.full" 2>"$TMP/err.full"
grep -qx "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" "$TMP/full.env" \
  || fail "injected supabase url not written"
grep -qx "VITE_TURNSTILE_SITE_KEY=0xTEST" "$TMP/full.env" \
  || fail "turnstile key not written"
grep -qx "SUPABASE_URL=$VITE_SUPABASE_URL" "$TMP/full.env" \
  || fail "expected SUPABASE_URL mirror"
[ ! -s "$TMP/out.full" ] || fail "script printed to stdout with secrets set"

echo "cloud-agent-write-env: ok"

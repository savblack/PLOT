#!/usr/bin/env bash
# Restore drill: prove the nightly backup is actually restorable.
#
# Streams a fresh pg_dump of Production straight into a throwaway local
# Postgres 17 cluster and compares row counts. Nothing unencrypted is ever
# written to disk — the dump is piped, never stored — and the cluster is
# destroyed at the end, because it contains real password hashes and PII.
#
# WHY THIS EXISTS: the runbook was untested for six weeks, and the first drill
# (2026-08-14) found that two tables silently failed to restore. pg_restore
# reports such failures on stderr and still exits 0, so a restore can look
# fine and quietly lose tables. This script makes that check repeatable.
#
# Usage:
#   PLOT_PRODUCTION_DB_PASSWORD=... scripts/db-restore-drill.sh
#   # or, from the main checkout:  node --env-file=.env -e '' ; set -a; . .env; set +a
#
# Requires: brew install postgresql@17   (Production is PG17; pg_dump 16 refuses
# to dump a newer server, and macOS ships 16 via postgresql@16.)
set -uo pipefail

PROJECT_REF="${PROJECT_REF:-mkegtssedjyqldysvzga}"
PORT="${DRILL_PORT:-55432}"
# Socket dir must be SHORT: the full socket path has a 103-byte limit, and a
# path under the agent scratchpad blows straight past it.
SOCK="${DRILL_SOCK:-/tmp/pgdrill}"
WORK="$(mktemp -d)"
PGDATA="$WORK/pgdata"

export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
# Without a fixed locale, PG17 on macOS dies with "postmaster became
# multithreaded during startup".
export LC_ALL=C LANG=C

if [ -z "${PLOT_PRODUCTION_DB_PASSWORD:-}" ]; then
  echo "PLOT_PRODUCTION_DB_PASSWORD is not set (it lives in the MAIN checkout's .env)" >&2
  exit 1
fi

cleanup() {
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  pkill -f "$PGDATA" >/dev/null 2>&1 || true
  sleep 1
  rm -rf "$WORK" "$SOCK"
  echo "torn down (cluster held real PII — deliberately not kept)"
}
trap cleanup EXIT

PW="$(python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PLOT_PRODUCTION_DB_PASSWORD"],safe=""))')"
PROD_URL="postgresql://postgres:$PW@db.${PROJECT_REF}.supabase.co:5432/postgres"

rm -rf "$SOCK"; mkdir -p "$SOCK"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null 2>&1
pg_ctl -D "$PGDATA" -l "$WORK/pg.log" \
  -o "-p $PORT -k $SOCK -c listen_addresses=''" start >/dev/null 2>&1
for _ in $(seq 1 20); do
  pg_isready -h "$SOCK" -p "$PORT" -U postgres >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h "$SOCK" -p "$PORT" -U postgres >/dev/null 2>&1 || {
  echo "local postgres failed to start:" >&2; cat "$WORK/pg.log" >&2; exit 1; }

LOCAL="postgresql://postgres@/postgres?host=$SOCK&port=$PORT"

# ---- Prerequisites the dump does NOT carry itself -------------------------
# These are the reason the first drill lost tables. `pg_dump -n public` emits no
# CREATE EXTENSION, so a citext column has nowhere to land and the whole CREATE
# TABLE fails. Same story for platform-owned roles and schemas.
for r in anon authenticated service_role supabase_auth_admin supabase_storage_admin authenticator; do
  psql "$LOCAL" -q -c \
    "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r') then create role $r nologin; end if; end \$\$;" 2>/dev/null
done
psql "$LOCAL" -q -c 'create schema if not exists extensions;' 2>/dev/null
# citext is installed in `public` on Production, not `extensions` — match that.
psql "$LOCAL" -q -c 'create extension if not exists citext schema public;' 2>/dev/null
for e in pgcrypto "uuid-ossp"; do
  psql "$LOCAL" -q -c "create extension if not exists \"$e\" schema extensions;" 2>/dev/null
done
# Webhook triggers call supabase_functions.http_request(); the schema is
# platform-owned so the function itself is absent here. Those two triggers are
# expected to fail in the drill and are fine on a real Supabase target.
psql "$LOCAL" -q -c 'create schema if not exists supabase_functions;' 2>/dev/null

echo "=== streaming Production -> throwaway local cluster ==="
pg_dump -Fc --no-owner --no-privileges \
  -n public -n auth -n storage -n supabase_migrations \
  -d "$PROD_URL" 2>"$WORK/dump.err" \
| pg_restore --no-owner --no-privileges -d "$LOCAL" 2>"$WORK/restore.err"

COUNT_SQL="select table_schema||'.'||table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema in ('public','auth','supabase_migrations') and table_type='BASE TABLE'
order by 1"

psql "$LOCAL" -At -F',' -c "$COUNT_SQL" > "$WORK/local.csv"
LOCAL_TABLES=$(psql "$LOCAL" -At -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")

echo
echo "dump stderr:    $(wc -l < "$WORK/dump.err") lines"
echo "restore stderr: $(wc -l < "$WORK/restore.err") lines"
echo "public base tables restored: $LOCAL_TABLES"
echo
echo "--- restore errors, deduplicated (pg_restore exits 0 even with these) ---"
grep -oE 'ERROR:  .*' "$WORK/restore.err" | sort | uniq -c | sort -rn || echo "(none)"
echo
echo "--- restored row counts ---"
column -s, -t < "$WORK/local.csv"
echo
echo "Compare the counts above against Production. Any table present on prod but"
echo "missing here is a silent restore failure — investigate before trusting the backup."

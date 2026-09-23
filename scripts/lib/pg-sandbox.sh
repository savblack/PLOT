#!/usr/bin/env bash
# Shared helper: a throwaway local Postgres 17 cluster loaded from Production.
#
# Sourced by scripts/db-restore-drill.sh (does the backup restore) and
# scripts/db-migration-test.sh (applies pending migrations on top). The setup is
# fiddly in ways that are easy to get wrong twice, so it lives in one place:
# the socket path has a 103-byte limit, PG17 on macOS needs a fixed locale, and
# a prior run must be stopped before its data directory is deleted.
#
# Nothing unencrypted is ever written: the dump is piped from pg_dump straight
# into pg_restore. The cluster holds real password hashes and PII and is
# destroyed on exit.

export PATH="/opt/homebrew/opt/postgresql@17/bin:/usr/lib/postgresql/17/bin:$PATH"
# Without this, PG17 on macOS dies with "postmaster became multithreaded during
# startup".
export LC_ALL=C LANG=C

SANDBOX_PORT="${SANDBOX_PORT:-55432}"
# Must be SHORT because the full socket path has a 103-byte cap. It is also
# unique per process so parallel runs cannot share a trust boundary.
SANDBOX_SOCK="${SANDBOX_SOCK:-/tmp/plot-pg-${UID:-$(id -u)}-$$}"
SANDBOX_WORK=""
SANDBOX_PGDATA=""
SANDBOX_URL=""
SANDBOX_PASSWORD=""

sandbox_require_pg17() {
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "pg_dump not found. Production is PG17. On macOS: brew install postgresql@17. On the Cloud Agent image: postgresql-17 is already on PATH." >&2
    return 1
  fi
  case "$(pg_dump --version)" in
    *' 17.'*) ;;
    *) echo "pg_dump is not v17 ($(pg_dump --version)); pg_dump refuses to dump a newer server" >&2; return 1 ;;
  esac
}

sandbox_prod_url() {
  # Prefer a full connection string when one is set. SUPABASE_DB_URL is the
  # session-pooler string the nightly backup already uses (db-backup.yml), and
  # on most networks it is the ONLY one that works: Supabase moved direct
  # connections to IPv6-only, so db.<ref>.supabase.co has no A record and
  # db.<ref>.supabase.co:5432 is unreachable from plenty of otherwise
  # IPv6-capable machines. The pooler still answers on IPv4.
  #
  # Measured on 2026-09-12: general IPv6 egress worked fine from the author's
  # Mac (HTTP 200 to ipv6.google.com) while TCP 5432 to the direct host did not
  # connect at all, and the pooler did. Symptom if you hit it: pg_dump writes
  # two lines to stderr, the sandbox restores nothing, and the run reports every
  # migration as failing. See the guard in sandbox_restore_prod.
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    printf '%s' "$SUPABASE_DB_URL"
    return 0
  fi

  if [ -z "${PLOT_PRODUCTION_DB_PASSWORD:-}" ]; then
    echo "Set PLOT_PRODUCTION_DB_PASSWORD (preferred) or a full SUPABASE_DB_URL in the MAIN checkout's .env." >&2
    echo "Both are on https://supabase.com/dashboard/project/${PROJECT_REF:-mkegtssedjyqldysvzga}/settings/database" >&2
    return 1
  fi
  # Build the POOLER string, not the direct one. The comment above explains why
  # the direct host is unreachable from plenty of machines; a fallback that
  # builds an unusable URL is not a fallback, and until 2026-09-13 this is
  # exactly what it did — every local run failed at the restore guard and the
  # only way through was to hand-set SUPABASE_DB_URL.
  #
  # The region prefix is per-project and is not derivable from the ref; a wrong
  # one fails fast and unmistakably with "(ENOTFOUND) tenant/user not found",
  # so if this ever moves, sweep the regions rather than guessing.
  local pw ref host
  ref="${PROJECT_REF:-mkegtssedjyqldysvzga}"
  host="${PLOT_PRODUCTION_POOLER_HOST:-aws-1-ap-south-1.pooler.supabase.com}"
  pw="$(python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PLOT_PRODUCTION_DB_PASSWORD"],safe=""))')"
  printf 'postgresql://postgres.%s:%s@%s:5432/postgres' "$ref" "$pw" "$host"
}

sandbox_down() {
  [ -n "$SANDBOX_PGDATA" ] || return 0
  pg_ctl -D "$SANDBOX_PGDATA" -m immediate stop >/dev/null 2>&1 || true
  pkill -f "$SANDBOX_PGDATA" >/dev/null 2>&1 || true
  sleep 1
  rm -rf "$SANDBOX_WORK" "$SANDBOX_SOCK"
  echo "sandbox torn down (it held real PII — deliberately not kept)"
}

sandbox_up() {
  SANDBOX_WORK="$(mktemp -d)"
  SANDBOX_PGDATA="$SANDBOX_WORK/pgdata"
  trap sandbox_down EXIT

  umask 077
  rm -rf "$SANDBOX_SOCK"; mkdir -m 700 -p "$SANDBOX_SOCK"
  SANDBOX_PASSWORD="$(openssl rand -hex 32)"
  printf '%s\n' "$SANDBOX_PASSWORD" > "$SANDBOX_WORK/pwfile"
  initdb -D "$SANDBOX_PGDATA" -U postgres --auth-local=scram-sha-256 \
    --auth-host=reject --pwfile="$SANDBOX_WORK/pwfile" >/dev/null 2>&1
  rm -f "$SANDBOX_WORK/pwfile"
  export PGPASSWORD="$SANDBOX_PASSWORD"
  pg_ctl -D "$SANDBOX_PGDATA" -l "$SANDBOX_WORK/pg.log" \
    -o "-p $SANDBOX_PORT -k $SANDBOX_SOCK -c listen_addresses='' -c unix_socket_permissions=0700" start >/dev/null 2>&1
  local i
  for i in $(seq 1 20); do
    pg_isready -h "$SANDBOX_SOCK" -p "$SANDBOX_PORT" -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
  if ! pg_isready -h "$SANDBOX_SOCK" -p "$SANDBOX_PORT" -U postgres >/dev/null 2>&1; then
    echo "local postgres failed to start:" >&2
    cat "$SANDBOX_WORK/pg.log" >&2
    return 1
  fi
  SANDBOX_URL="postgresql://postgres@/postgres?host=$SANDBOX_SOCK&port=$SANDBOX_PORT"
  echo "sandbox up on port $SANDBOX_PORT"
}

# Roles, extensions and schemas the dump references but does not carry. Getting
# this wrong is not loud: `pg_dump -n public` emits no CREATE EXTENSION, so a
# citext column silently takes its whole CREATE TABLE down with it, and
# pg_restore still exits 0.
sandbox_prereqs() {
  local r e
  for r in anon authenticated service_role supabase_auth_admin supabase_storage_admin authenticator; do
    psql "$SANDBOX_URL" -q -c \
      "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r') then create role $r nologin; end if; end \$\$;" 2>/dev/null
  done
  psql "$SANDBOX_URL" -q -c 'create schema if not exists extensions;' 2>/dev/null
  # citext is installed in `public` on Production, not `extensions` — match it.
  psql "$SANDBOX_URL" -q -c 'create extension if not exists citext schema public;' 2>/dev/null
  for e in pgcrypto "uuid-ossp"; do
    psql "$SANDBOX_URL" -q -c "create extension if not exists \"$e\" schema extensions;" 2>/dev/null
  done
  psql "$SANDBOX_URL" -q -c 'create schema if not exists supabase_functions;' 2>/dev/null
}

# Supabase-only pieces that simply do not exist in a vanilla Postgres: Vault
# (pgsodium-backed) and pg_net. Migrations legitimately depend on them, so the
# sandbox stubs them rather than pretending such migrations are untestable.
#
# This is the sandbox's main fidelity limit and it is deliberate: SQL errors,
# missing columns, bad signatures and constraint violations are all caught, but
# anything whose CORRECTNESS depends on a real HTTP call or real decryption is
# not. Those still need the Staging project.
sandbox_stub_supabase_platform() {
  psql "$SANDBOX_URL" -q <<'SQL' 2>/dev/null
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  secret text,
  description text
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null,
                                               new_description text default '')
returns uuid language plpgsql as $$
declare id uuid;
begin
  insert into vault.secrets (name, secret, description)
  values (new_name, new_secret, new_description)
  on conflict (name) do update set secret = excluded.secret
  returning vault.secrets.id into id;
  return id;
end $$;

create schema if not exists net;
-- No-op stand-in: records the call so a migration can be inspected, but makes
-- no request. A migration that "works" here has valid SQL, not proven delivery.
create table if not exists net._stub_calls (
  id bigserial primary key, url text, called_at timestamptz default now()
);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$
begin
  insert into net._stub_calls (url) values (url);
  return currval('net._stub_calls_id_seq');
end $$;
SQL
}

sandbox_restore_prod() {
  local prod_url="$1"
  PLOT_DB_CONNINFO="$prod_url" node scripts/write-pg-service.mjs \
    "$SANDBOX_WORK/prod_service.conf" plot_production
  PGSERVICEFILE="$SANDBOX_WORK/prod_service.conf" PGSERVICE=plot_production \
  pg_dump -Fc --no-owner --no-privileges \
    -n public -n auth -n storage -n supabase_migrations \
    2>"$SANDBOX_WORK/dump.err" \
  | pg_restore --no-owner --no-privileges -d "$SANDBOX_URL" 2>"$SANDBOX_WORK/restore.err"
  echo "restored from Production (dump stderr: $(wc -l < "$SANDBOX_WORK/dump.err") lines, restore stderr: $(wc -l < "$SANDBOX_WORK/restore.err") lines)"

  # Abort if the dump brought nothing. Without this the run continues against an
  # empty sandbox and every migration "fails" on a missing schema, which reads as
  # "your migrations are broken" when the truth is "we never reached production".
  # That false signal cost two debugging passes on 2026-09-12, and its danger is
  # not the wasted time: it invites someone to "fix" migrations that are fine.
  if ! psql "$SANDBOX_URL" -At -c "select 1 from pg_namespace where nspname = 'auth'" 2>/dev/null | grep -q 1; then
    echo "" >&2
    echo "✗ the restore produced no 'auth' schema, so production was never reached." >&2
    echo "  Nothing below would be a real result. The dump said:" >&2
    sed 's/^/    /' "$SANDBOX_WORK/dump.err" >&2
    echo "" >&2
    echo "  Most often this is the connection, not the credential: the direct host" >&2
    echo "  is IPv6-only. Set SUPABASE_DB_URL to the session-pooler string, which" >&2
    echo "  answers on IPv4." >&2
    return 1
  fi
}

// Read-only drift check: does each database match the migrations in this
// checkout, and does Staging's schema match production's?
//
// WHY THIS EXISTS
// On 2026-09-25 Staging was 18 migrations behind main and nobody knew. Some had
// been applied by hand without being recorded, others recorded without being
// run, and branch migrations tried out on Staging sat alongside them. Two
// failure shapes did real damage and neither is visible to any other check:
//
//   1. Version collisions. Two branches picked the same timestamp. Staging
//      already had 20260926160000 recorded as a branch's watch_together_free,
//      so main's refresh_premium_badges at that version was "applied" there in
//      the ledger and never run. Had the branch merged unrenumbered,
//      production would have skipped its migration the same way.
//   2. Ledger vs schema. A row in schema_migrations proves nothing about the
//      schema, and a hand-applied change leaves no row. Only comparing the
//      catalog catches both directions.
//
// It also found production carrying four migrations that were on no branch
// anyone could find. That fails here too.
//
// WHAT IT CHECKS
//   • production ledger vs supabase/migrations in this checkout
//   • Staging ledger vs the same files
//   • Staging schema vs production schema (public tables, columns,
//     constraints, indexes, functions, triggers, policies, grants, plus
//     extensions, cron jobs and storage buckets), as md5 fingerprints
// Severity rules live in classifyDrift() in scripts/lib/migrationDriftChecks.mjs.
// Migrations this branch adds on top of origin/main are expected to be
// unrecorded and are reported, not failed.
//
// READ-ONLY. Every query runs inside `begin read only … rollback`. PGOPTIONS
// cannot enforce this: the Supabase pooler ignores it.
//
// Usage:
//   node --env-file=.env scripts/check-migration-drift.mjs            # both
//   node --env-file=.env scripts/check-migration-drift.mjs --only staging
//   … --only production     … --no-schema (ledgers only)
//
// Credentials (from the MAIN checkout's .env locally, Actions secrets in CI):
//   production: SUPABASE_DB_URL, or PLOT_PRODUCTION_DB_PASSWORD
//   Staging:    PLOT_STAGING_DB_PASSWORD
// Pooler hosts default to the ones in scripts/lib/pg-sandbox.sh and
// scripts/staging-sql.sh; override with PLOT_PRODUCTION_POOLER_HOST /
// PLOT_STAGING_POOLER_HOST.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDbConnectionOptions, serializePgService } from './lib/dbWritePathChecks.mjs';
import { parseMigrationFiles, compareLedger, diffFingerprints, classifyDrift } from './lib/migrationDriftChecks.mjs';

const MIGRATIONS_DIR = 'supabase/migrations';
const PRODUCTION_REF = 'mkegtssedjyqldysvzga';
const STAGING_REF = 'uzrhfivnhdcfieuaxzip';

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (only && only !== 'staging' && only !== 'production') {
  console.error('--only takes "staging" or "production".');
  process.exit(1);
}
const wantProduction = only !== 'staging';
const wantStaging = only !== 'production';
const wantSchema = wantProduction && wantStaging && !args.includes('--no-schema');

const clean = (v) => (v ?? '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();

function productionOptions() {
  const url = clean(process.env.SUPABASE_DB_URL);
  if (url) return parseDbConnectionOptions(url);
  const password = clean(process.env.PLOT_PRODUCTION_DB_PASSWORD);
  if (!password) return null;
  return {
    host: process.env.PLOT_PRODUCTION_POOLER_HOST || 'aws-1-ap-south-1.pooler.supabase.com',
    port: '5432', user: `postgres.${PRODUCTION_REF}`, password, dbname: 'postgres',
  };
}

function stagingOptions() {
  const password = clean(process.env.PLOT_STAGING_DB_PASSWORD);
  if (!password) return null;
  return {
    host: process.env.PLOT_STAGING_POOLER_HOST || 'aws-0-ap-southeast-2.pooler.supabase.com',
    port: '5432', user: `postgres.${STAGING_REF}`, password, dbname: 'postgres',
  };
}

const targets = {};
if (wantProduction) targets.production = productionOptions();
if (wantStaging) targets.staging = stagingOptions();
for (const [name, opts] of Object.entries(targets)) {
  if (!opts) {
    const need = name === 'production' ? 'SUPABASE_DB_URL or PLOT_PRODUCTION_DB_PASSWORD' : 'PLOT_STAGING_DB_PASSWORD';
    console.error(`No credentials for ${name}: set ${need} (the MAIN checkout's .env locally, an Actions secret in CI).`);
    process.exit(1);
  }
}

// Same transport as check-db-write-paths.mjs: a mode-0600 service file keeps
// the password out of argv, where every other process on the machine can read it.
function query(target, sql) {
  const opts = targets[target];
  const dir = mkdtempSync(join(tmpdir(), 'plot-drift-'));
  const file = join(dir, 'pg_service.conf');
  writeFileSync(file, serializePgService('plot_drift_check', opts), { mode: 0o600 });
  const body = `select coalesce(json_agg(t), '[]'::json) from (${sql.replace(/;\s*$/, '')}) t`;
  try {
    const out = execFileSync('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      input: `begin read only;\n${body};\nrollback;\n`,
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PGSERVICE: 'plot_drift_check', PGSERVICEFILE: file, PGCONNECT_TIMEOUT: '15' },
    }).trim();
    return JSON.parse(out || '[]');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.error('psql not found. Supabase is PG17: brew install postgresql@17, and put it on PATH.');
    } else {
      // Never print err itself: its args/env carry the connection details.
      console.error(`psql failed on ${target}: ${String(err?.stderr ?? 'unknown error').split(opts.password).join('«redacted»')}`);
    }
    process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Versions this branch adds on top of origin/main. Without git (or without an
// origin/main ref) nothing is treated as branch-new, which is the strict answer.
function branchNewVersions(files) {
  try {
    const onMain = execFileSync('git', ['ls-tree', '--name-only', 'origin/main', `${MIGRATIONS_DIR}/`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').map((p) => p.split('/').pop());
    const mainVersions = parseMigrationFiles(onMain);
    return new Set([...files.keys()].filter((v) => !mainVersions.has(v)));
  } catch {
    return new Set();
  }
}

const LEDGER_SQL = `select version, name from supabase_migrations.schema_migrations`;

// Objects owned by an extension are skipped: their definitions belong to the
// platform, not to Plot's migrations.
//
// Privileges are compared as what anon and authenticated can actually DO, not
// as raw ACL strings. Production spells out anon/authenticated on every
// function while Staging relies on the PUBLIC grant: identical in effect, but
// every function's ACL differed and buried the real findings on the first run.
// Column grants are only listed where a role can UPDATE a column without
// table-wide UPDATE, the shape 20260918030000 uses (notifications: update
// (read_at) only). Listing every column a role cannot update would just repeat
// the table-grant difference hundreds of times.
const FINGERPRINT_SQL = `
with ext as (select objid from pg_depend where deptype = 'e'),
pub as (select oid from pg_namespace where nspname = 'public'),
rels as (
  select c.oid, c.relname, c.relkind from pg_class c
  where c.relnamespace = (select oid from pub) and c.relkind in ('r','p','v','m','f')
    and c.oid not in (select objid from ext)
)
select 'relation:' || relname as k, relkind::text as h from rels
union all
select 'column:' || r.relname || '.' || a.attname,
       md5(format_type(a.atttypid, a.atttypmod) || a.attnotnull || coalesce(pg_get_expr(d.adbin, d.adrelid), ''))
from rels r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
union all
select 'constraint:' || r.relname || '.' || co.conname, md5(pg_get_constraintdef(co.oid))
from pg_constraint co join rels r on r.oid = co.conrelid
union all
select 'index:' || i.relname, md5(pg_get_indexdef(i.oid))
from pg_index x join pg_class i on i.oid = x.indexrelid join rels r on r.oid = x.indrelid
union all
select 'function:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       md5(p.prosrc || p.prosecdef || coalesce(array_to_string(p.proconfig, ','), ''))
from pg_proc p where p.pronamespace = (select oid from pub) and p.oid not in (select objid from ext)
union all
select 'execute:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       has_function_privilege('anon', p.oid, 'execute') || ',' || has_function_privilege('authenticated', p.oid, 'execute')
from pg_proc p where p.pronamespace = (select oid from pub) and p.oid not in (select objid from ext)
union all
select 'trigger:' || r.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
from pg_trigger t join rels r on r.oid = t.tgrelid where not t.tgisinternal
union all
select 'policy:' || pol.tablename || '.' || pol.policyname,
       md5(pol.cmd || array_to_string(pol.roles, ',') || coalesce(pol.qual, '') || coalesce(pol.with_check, ''))
from pg_policies pol where pol.schemaname in ('public', 'storage')
union all
select 'grant:' || r.relname || '.' || role,
       concat_ws(',', has_table_privilege(role, r.oid, 'select'), has_table_privilege(role, r.oid, 'insert'),
                 has_table_privilege(role, r.oid, 'update'), has_table_privilege(role, r.oid, 'delete'))
from rels r cross join (values ('anon'), ('authenticated')) roles(role)
union all
select 'column-grant:' || r.relname || '.' || a.attname || '.' || role,
       'update'
from rels r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
cross join (values ('anon'), ('authenticated')) roles(role)
where not has_table_privilege(role, r.oid, 'update') and has_column_privilege(role, r.oid, a.attnum, 'update')
union all
select 'extension:' || extname, '' from pg_extension
union all
select 'bucket:' || id, md5(public::text || coalesce(file_size_limit::text, '') || coalesce(array_to_string(allowed_mime_types, ','), ''))
from storage.buckets`;

// cron.job only exists once pg_cron is installed, and Staging went without it
// until 2026-09-26, so it is queried separately rather than breaking the rest.
const HAS_CRON_SQL = `select to_regclass('cron.job') is not null as has_cron`;
const CRON_SQL = `select 'cron:' || jobname as k, md5(schedule || command || active) as h from cron.job`;

function fingerprint(target) {
  const rows = query(target, FINGERPRINT_SQL);
  if (query(target, HAS_CRON_SQL)[0]?.has_cron) rows.push(...query(target, CRON_SQL));
  return new Map(rows.map((r) => [r.k, r.h]));
}

// ── Run ──────────────────────────────────────────────────────────────────────
const files = parseMigrationFiles(readdirSync(MIGRATIONS_DIR));
const branchNew = branchNewVersions(files);
const results = {};

for (const target of Object.keys(targets)) {
  const ledger = new Map(query(target, LEDGER_SQL).map((r) => [r.version, r.name ?? '']));
  results[target] = compareLedger({ files, ledger, branchNew });
  console.log(`▶ ${target}: ${ledger.size} recorded, ${files.size} files in ${MIGRATIONS_DIR}`);
}
if (wantSchema) {
  results.schema = diffFingerprints(fingerprint('staging'), fingerprint('production'));
  console.log('▶ schema: Staging compared with production');
}

const { failures, warnings, notes } = classifyDrift(results);
console.log('');
for (const n of notes) console.log(`  · ${n}`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const f of failures) console.log(`  ✗ ${f}`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} drift problem(s). Nothing was changed; fixing them needs a deliberate apply or ledger repair.`);
  process.exit(1);
}
console.log(`\n✓ no drift${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);

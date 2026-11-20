// Bring Staging up to the migrations in this checkout: apply every
// supabase/migrations file Staging has not recorded, and record each one in
// supabase_migrations.schema_migrations, all in ONE transaction.
//
// WHY THIS EXISTS
// The Supabase GitHub integration applies a merged migration to production and
// nothing applies it to Staging. Every migration merge therefore left Staging
// behind until someone caught it up by hand, and the nightly drift check
// (scripts/check-migration-drift.mjs) failed every night in between: 16, 18
// and 19 November 2026. .github/workflows/staging-migrate.yml runs this on
// each push to main that touches supabase/migrations, so Staging follows main
// the way production does.
//
// WHAT IT REFUSES
// A file whose version Staging already recorded under another name. That is a
// branch migration tried out on Staging that took a number main later used
// (20261119100000 was import_jobs_tmdb_source on Staging and episode_airings
// on main). Applying around it would leave main's migration "applied" in the
// ledger without running. Nothing is changed; a person renumbers the branch
// and moves Staging's row (docs/ops/migrations.md, "Staging follows main").
//
// Branch-only versions on Staging (recorded, no file here) are left alone.
//
// All or nothing: one transaction, ON_ERROR_STOP. If any migration fails,
// Staging is exactly as it was and the run fails.
//
// Staging only. The project ref is fixed; there is no flag for production.
//
// Usage:
//   pnpm run staging:migrate                # apply
//   pnpm run staging:migrate -- --dry-run   # list what would be applied
// Needs PLOT_STAGING_DB_PASSWORD (the MAIN checkout's .env locally, an
// Actions secret in CI) and psql 17 (`brew install postgresql@17`).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serializePgService } from './lib/dbWritePathChecks.mjs';
import { parseMigrationFiles, planStagingApply } from './lib/migrationDriftChecks.mjs';

const MIGRATIONS_DIR = resolve('supabase/migrations');
const STAGING_REF = 'uzrhfivnhdcfieuaxzip';
const dryRun = process.argv.includes('--dry-run');

const password = (process.env.PLOT_STAGING_DB_PASSWORD ?? '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
if (!password) {
  console.error("Set PLOT_STAGING_DB_PASSWORD (the MAIN checkout's .env locally, an Actions secret in CI).");
  process.exit(1);
}
const options = {
  host: process.env.PLOT_STAGING_POOLER_HOST || 'aws-0-ap-southeast-2.pooler.supabase.com',
  port: '5432', user: `postgres.${STAGING_REF}`, password, dbname: 'postgres',
};

// Same transport as check-migration-drift.mjs: a mode-0600 service file keeps
// the password out of argv.
function psql(input, { quiet = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'plot-staging-migrate-'));
  const file = join(dir, 'pg_service.conf');
  writeFileSync(file, serializePgService('plot_staging_migrate', options), { mode: 0o600 });
  try {
    return execFileSync('psql', ['-X', ...(quiet ? ['-q'] : []), '-tA', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PGSERVICE: 'plot_staging_migrate', PGSERVICEFILE: file, PGCONNECT_TIMEOUT: '15' },
    });
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.error('psql not found. Supabase is PG17: brew install postgresql@17, and put it on PATH.');
    } else {
      // Never print err itself: its args/env carry the connection details.
      const redact = (s) => String(s ?? '').split(password).join('«redacted»');
      console.error(redact(err?.stdout));
      console.error(redact(err?.stderr ?? 'psql failed'));
      console.error('✗ Staging is unchanged: the transaction rolled back.');
    }
    process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;

const files = parseMigrationFiles(readdirSync(MIGRATIONS_DIR));
const ledgerRows = JSON.parse(psql(
  "begin read only;\nselect coalesce(json_agg(json_build_object('version', version, 'name', name)), '[]'::json) from supabase_migrations.schema_migrations;\nrollback;\n",
).trim() || '[]');
const ledger = new Map(ledgerRows.map((r) => [r.version, r.name ?? '']));
const { pending, collisions } = planStagingApply({ files, ledger });

if (collisions.length) {
  for (const c of collisions) {
    console.error(`✗ Staging recorded ${c.version} as "${c.recorded}", but this checkout's file is "${c.file}".`);
  }
  console.error('  Two migrations share a version. Renumber the branch one, move its Staging ledger row to the new');
  console.error('  version, then rerun. Nothing was applied. See docs/ops/migrations.md, "Staging follows main".');
  process.exit(1);
}

if (!pending.length) {
  console.log(`✓ Staging already records all ${files.size} migrations in this checkout.`);
  process.exit(0);
}

console.log(`${dryRun ? 'Would apply' : 'Applying'} ${pending.length} migration(s) to Staging:`);
for (const p of pending) console.log(`  ${p.version}_${p.name}.sql`);
if (dryRun) process.exit(0);

const script = ['begin;'];
for (const p of pending) {
  script.push(
    `\\echo 'applying ${p.version}_${p.name}'`,
    `\\i ${join(MIGRATIONS_DIR, `${p.version}_${p.name}.sql`)}`,
    `insert into supabase_migrations.schema_migrations (version, name) values (${sqlString(p.version)}, ${sqlString(p.name)});`,
  );
}
script.push('commit;', '');
psql(script.join('\n'));
console.log(`✓ applied and recorded ${pending.length} migration(s) on Staging.`);

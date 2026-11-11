// Hourly check that the database's own scheduled jobs (pg_cron) are running
// and passing. The logic and its reasons are in scripts/lib/cronHealth.mjs;
// this file only fetches the rows and reports.
//
// Reads public.cron_job_health() (20261111173000_cron_job_health.sql), which
// returns names, schedules, timestamps and statuses only. pg_cron's error text
// is never fetched, so nothing here can print it into a public Actions log.
//
// Usage:
//   SUPABASE_DB_URL=… node scripts/check-cron-jobs.mjs        # CI (read-only role)
//   node scripts/check-cron-jobs.mjs --json rows.json         # judge saved rows
//
// CI passes SUPABASE_DB_URL from SUPABASE_DB_URL_READONLY and sets
// PLOT_DB_EXPECTED_ROLE=plot_ci_readonly, so the connection's identity is
// verified before anything is read, exactly as db-write-paths does.
//
// Exit 0 when every active job is healthy, 1 when any failed or stalled, 2
// when the check itself could not run. With GITHUB_OUTPUT set it writes
// `summary=<job names and what is wrong>` for the incident issue and email.

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateCronJobs, summarizeProblems } from './lib/cronHealth.mjs';
import {
  assertCiReadonlyIdentity, describeDbUrlShape, parseDbConnectionOptions, serializePgService,
} from './lib/dbWritePathChecks.mjs';

const jsonIndex = process.argv.indexOf('--json');
const JSON_FILE = jsonIndex === -1 ? null : process.argv[jsonIndex + 1];
// Trimmed and unquoted for the same reason as check-db-write-paths.mjs: a
// secret pasted with quotes or a newline otherwise reaches psql as a database name.
const DB_URL = (process.env.SUPABASE_DB_URL ?? '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim() || undefined;

function fail(message) {
  console.error(message);
  process.exit(2);
}

function query(sql) {
  const wrapped = `select coalesce(json_agg(t), '[]'::json) from (${sql.replace(/;\s*$/, '')}) t`;
  const parsed = parseDbConnectionOptions(DB_URL);
  if (!parsed) fail('SUPABASE_DB_URL could not be parsed safely.');
  // The credential goes in a mode-0600 service file, never argv, which any
  // process on the machine can read.
  const serviceDir = mkdtempSync(join(tmpdir(), 'plot-cron-check-'));
  const serviceFile = join(serviceDir, 'pg_service.conf');
  writeFileSync(serviceFile, serializePgService('plot_cron_check', parsed), { mode: 0o600 });
  try {
    const out = execFileSync('psql', ['-X', '-tAc', wrapped], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PGSERVICE: 'plot_cron_check', PGSERVICEFILE: serviceFile },
    }).trim();
    return JSON.parse(out || '[]');
  } catch (err) {
    // Never print the error object: on ENOENT it carries the whole call,
    // and psql's stderr can echo connection details. process.exit skips
    // `finally`, so remove the credential file first.
    rmSync(serviceDir, { recursive: true, force: true });
    if (err?.code === 'ENOENT') fail('psql not found. Production is PG17: brew install postgresql@17');
    let text = String(err?.stderr || err?.message || 'unknown error');
    for (const secret of [DB_URL, parsed.password]) if (secret) text = text.split(secret).join('«redacted»');
    fail(`psql failed: ${text}`);
  } finally {
    rmSync(serviceDir, { recursive: true, force: true });
  }
}

let rows;
if (JSON_FILE) {
  rows = JSON.parse(readFileSync(JSON_FILE, 'utf8'));
} else {
  if (!DB_URL) fail('Need SUPABASE_DB_URL (CI uses the read-only SUPABASE_DB_URL_READONLY), or --json <file>.');
  const shape = describeDbUrlShape(DB_URL);
  if (!shape.ok) fail(`SUPABASE_DB_URL ${shape.reason}. Expected postgresql://USER:PASSWORD@HOST:PORT/DATABASE.`);

  if (process.env.PLOT_DB_EXPECTED_ROLE) {
    const [identity] = query(`
      select current_user as role, r.rolsuper as superuser, r.rolcreaterole as create_role,
             r.rolcreatedb as create_db, r.rolreplication as replication, r.rolbypassrls as bypass_rls,
             has_schema_privilege(current_user, 'public', 'CREATE') as public_create,
             exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
                       and (has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                            or has_any_column_privilege(current_user, c.oid, 'INSERT,UPDATE,REFERENCES'))) as public_write,
             exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'S'
                       and has_sequence_privilege(current_user, c.oid, 'USAGE,UPDATE')) as sequence_write
      from pg_roles r where r.rolname = current_user`);
    try {
      assertCiReadonlyIdentity(identity, process.env.PLOT_DB_EXPECTED_ROLE);
    } catch (err) {
      fail(err.message);
    }
    console.log(`Connection role verified: ${identity.role}.\n`);
  }

  const [exists] = query(`select to_regprocedure('public.cron_job_health()') is not null as ok`);
  if (!exists?.ok) fail('public.cron_job_health() does not exist. Has 20261111173000_cron_job_health.sql been applied?');
  rows = query('select * from public.cron_job_health()');
}

const now = new Date();
const { problems, unreadable, checked } = evaluateCronJobs(rows, now);

console.log(`Checked ${checked} active pg_cron job(s) at ${now.toISOString()}.\n`);
for (const r of rows) {
  if (!r.active) continue;
  const name = r.jobname || '(unnamed job)'; // pg_cron allows unnamed jobs
  const bad = problems.filter((p) => p.jobname === name);
  const mark = bad.length ? '✗' : '✓';
  console.log(`${mark} ${name.padEnd(30)} ${String(r.schedule).padEnd(20)} last run ${r.last_start ?? 'none'} (${r.last_status ?? 'none'})`);
  for (const p of bad) console.log(`    ${p.kind}: ${p.detail}`);
}
for (const name of unreadable) {
  console.log(`\n! ${name}: schedule not understood or longer than the 7 days of kept history, so only its failures are checked, not whether it stopped.`);
}

const summary = summarizeProblems(problems);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary.replace(/[\r\n]/g, ' ')}\n`);

if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s): ${summary}`);
  process.exit(1);
}
console.log('\n✓ every active job ran on time and its last run passed.');

// Read-only counts for background imports, for a person who needs to know
// whether imports are working without reading anyone's history.
//
//   pnpm run imports:report                       # last 24 hours, every source
//   pnpm run imports:report -- --hours 72         # a longer window
//   pnpm run imports:report -- --user c904c92c    # one account, by id prefix
//
// Prints counts, statuses and the first 80 characters of a failure message.
// Never prints titles, file names, emails or anything else a person typed.
// The prefix must match exactly one account, or nothing is shown.
//
// Needs SUPABASE_DB_URL (the main checkout's .env; `node --env-file=.env`
// via the package script) and psql (brew install postgresql@17). Every
// statement runs in a read-only transaction.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDbConnectionOptions, serializePgService } from './lib/dbWritePathChecks.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const hours = Number(flag('--hours') ?? 24);
const userPrefix = flag('--user');
const DB_URL = (process.env.SUPABASE_DB_URL ?? '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim() || undefined;

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 90) fail('--hours must be between 1 and 2160.');
if (userPrefix !== null && !/^[0-9a-f-]{8,36}$/i.test(userPrefix)) fail('--user takes the start of an account id: at least 8 hex characters.');
if (!DB_URL) fail('Set SUPABASE_DB_URL (the main checkout\'s .env has it).');

const parsed = parseDbConnectionOptions(DB_URL);
if (!parsed) fail('SUPABASE_DB_URL could not be parsed safely.');
// The credential goes in a mode-0600 service file, never argv.
const serviceDir = mkdtempSync(join(tmpdir(), 'plot-import-report-'));
const serviceFile = join(serviceDir, 'pg_service.conf');
writeFileSync(serviceFile, serializePgService('plot_import_report', parsed), { mode: 0o600 });

function query(sql) {
  const wrapped = `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`;
  try {
    const out = execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-tAc', wrapped], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: `/opt/homebrew/opt/postgresql@17/bin:${process.env.PATH}`,
        PGSERVICE: 'plot_import_report', PGSERVICEFILE: serviceFile,
        PGOPTIONS: '-c default_transaction_read_only=on',
      },
    }).trim();
    return JSON.parse(out || '[]');
  } catch {
    // Never print the error: psql's stderr can echo connection details.
    rmSync(serviceDir, { recursive: true, force: true });
    fail('The query failed. Check SUPABASE_DB_URL and that psql 17 is installed.');
  }
}

try {
  if (userPrefix) {
    // psql -c does not expand :variables, so the prefix is checked above to
    // be hex and dashes only before it is placed in the statement.
    const accounts = query(`select count(*)::int as n from auth.users where id::text like '${userPrefix.toLowerCase()}%'`);
    if (accounts[0]?.n !== 1) fail(`That prefix matches ${accounts[0]?.n ?? 0} accounts. Use a longer one.`);
    const jobs = query(`
      select to_char(created_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') as created_utc, source, kind, status, phase,
             progress_total as total, imported, duplicates, failed, review_count as review,
             left(coalesce(last_error, ''), 80) as error
      from public.import_jobs where user_id::text like '${userPrefix.toLowerCase()}%' order by created_at`);
    const history = query(`
      select media_type, count(*)::int as titles, count(*) filter (where watched_at is null)::int as no_watch_date
      from public.history where user_id::text like '${userPrefix.toLowerCase()}%' group by media_type order by media_type`);
    const lists = query(`
      select (select count(*)::int from public.imported_lists where user_id::text like '${userPrefix.toLowerCase()}%') as custom_lists,
             (select count(*)::int from public.imported_list_entries where user_id::text like '${userPrefix.toLowerCase()}%') as list_entries`);
    console.log('Import jobs');
    console.table(jobs);
    console.log('History (titles)');
    console.table(history);
    console.log('Imported lists (custom lists, and entries across every list including the watchlist)');
    console.table(lists);
  } else {
    const bySource = query(`
      select source, status, count(*)::int as jobs, coalesce(sum(imported), 0)::int as imported, coalesce(sum(failed), 0)::int as failed
      from public.import_jobs where created_at > now() - make_interval(hours => ${hours})
      group by source, status order by source, status`);
    const errors = query(`
      select source, left(coalesce(last_error, ''), 80) as error, count(*)::int as jobs
      from public.import_jobs where created_at > now() - make_interval(hours => ${hours}) and status = 'failed'
      group by 1, 2 order by jobs desc limit 20`);
    console.log(`Import jobs in the last ${hours} hours`);
    console.table(bySource);
    console.log('Failure messages');
    console.table(errors);
  }
} finally {
  rmSync(serviceDir, { recursive: true, force: true });
}

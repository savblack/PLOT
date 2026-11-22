// End to end on PLOT Staging: upload four export files the way the apps do and
// check that the background import worker saves them.
//
//   pnpm run staging:import-e2e
//
// WHY: for six days in November 2026 the worker read and matched every
// uploaded file on production and then saved nothing (its saves were refused,
// #1722). Every unit test, browser test and Staging SQL test passed the whole
// time, because none of them runs the real chain: the app's upload, the
// storage bucket, the queue, the deployed edge function, the database
// functions it saves through. This does, every night.
//
// WHAT RUNS, as one dedicated account (plot-import-e2e@example.invalid):
//   1. the account is made if Staging has lost it, given a fresh random
//      password, and emptied of anything a previous run left;
//   2. it signs in and uploads each file through @plot/core's startFileImport,
//      exactly as the web and iPhone import sheets do;
//   3. each job is polled until the deployed import-worker finishes it, and
//      must end "succeeded" with titles saved and none failed;
//   4. the account is emptied again.
//
// STAGING ONLY. The database connection goes through scripts/staging-sql.sh,
// which fixes Staging's project ref and cannot reach production. The API URL
// is built from the same ref. No production credential is read.
//
// Needs PLOT_STAGING_DB_PASSWORD (to make and empty the account) and Staging's
// publishable key: PLOT_STAGING_PUBLISHABLE_KEY, or VITE_SUPABASE_ANON_KEY when
// VITE_SUPABASE_URL points at Staging (the main checkout's .env locally).
// Staging's import-worker must have IMPORT_EVENTS_ENABLED and
// IMPORT_ANNOTATIONS_ENABLED on, as production does.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_REF = 'uzrhfivnhdcfieuaxzip';
const URL_BASE = `https://${STAGING_REF}.supabase.co`;
const EMAIL = 'plot-import-e2e@example.invalid';
const JOB_TIMEOUT_MS = 4 * 60_000;
const POLL_MS = 4000;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const publishable = process.env.PLOT_STAGING_PUBLISHABLE_KEY
  || (process.env.VITE_SUPABASE_URL?.includes(STAGING_REF) ? process.env.VITE_SUPABASE_ANON_KEY : '');
if (!process.env.PLOT_STAGING_DB_PASSWORD) fail('PLOT_STAGING_DB_PASSWORD is not set (the main checkout\'s .env locally, an Actions secret in CI).');
if (!publishable) fail('Staging\'s publishable key is not set: PLOT_STAGING_PUBLISHABLE_KEY, or a Staging VITE_SUPABASE_URL with VITE_SUPABASE_ANON_KEY.');

// ── Staging SQL, through the wrapper that cannot reach production ────────────

const work = mkdtempSync(join(tmpdir(), 'plot-import-e2e-'));
function stagingSql(name, sql) {
  const file = join(work, `${name}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  try {
    return execFileSync('bash', [join(ROOT, 'scripts', 'staging-sql.sh'), file], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`Staging SQL "${name}" failed:\n${error.stdout || ''}${error.stderr || ''}`);
  }
}

// Empties every public table that has a user_id column of this account's rows,
// except its profile. Two passes, so a row another row points at goes on the
// second. Only ever this one dedicated account.
const EMPTY_ACCOUNT = `
  for pass in 1..2 loop
    for t in select c.table_name from information_schema.columns c
      join information_schema.tables b on b.table_schema = c.table_schema and b.table_name = c.table_name and b.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'user_id' and c.table_name <> 'profiles' loop
      begin
        execute format('delete from public.%I where user_id = $1', t.table_name) using uid;
      exception when others then null;
      end;
    end loop;
  end loop;`;

function prepareAccount(password) {
  // The password is random hex made here, so it is safe inside the literal.
  const out = stagingSql('prepare', `\\set ON_ERROR_STOP on
begin;
do $$
declare uid uuid; t record; pass integer;
begin
  select id into uid from auth.users where email = '${EMAIL}';
  if uid is null then
    uid := gen_random_uuid();
    -- The token columns are '' rather than null: the sign-in service reads
    -- them as text and fails on null.
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${EMAIL}', now(),
      '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', now(), now());
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), uid, uid::text, 'email',
      jsonb_build_object('sub', uid::text, 'email', '${EMAIL}', 'email_verified', true), now(), now(), now());
  end if;
  update auth.users set encrypted_password = extensions.crypt('${password}', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
  ${EMPTY_ACCOUNT}
  raise notice 'PASS account %', uid;
end $$;
commit;
`);
  const uid = out.match(/PASS account ([0-9a-f-]{36})/)?.[1];
  if (!uid) fail(`Could not prepare the Staging import account:\n${out}`);
  return uid;
}

function emptyAccount() {
  stagingSql('empty', `\\set ON_ERROR_STOP on
begin;
do $$
declare uid uuid; t record; pass integer;
begin
  select id into uid from auth.users where email = '${EMAIL}';
  if uid is null then raise notice 'PASS nothing to empty'; return; end if;
  ${EMPTY_ACCOUNT}
  -- Leave no usable password behind between runs.
  update auth.users set encrypted_password = null where id = uid;
  raise notice 'PASS account emptied';
end $$;
commit;
`);
}

// ── The import, as the apps do it ────────────────────────────────────────────

const fixture = name => new TextEncoder().encode(readFileSync(join(ROOT, 'packages/core/tests/fixtures/imports', name), 'utf8'));
// label, source, uploaded file name, fixture, the person's answer to "which list is this?"
const CASES = [
  ['IMDb ratings under a random file name', 'imdb', '7aff628a-6ff9-4549-8146-212eae03c528.csv', 'imdb-movie-ratings.csv', null],
  ['IMDb list answered "my watchlist"', 'imdb', '0c1d2e3f-aaaa-4bbb-8ccc-123456789abc.csv', 'imdb-watchlist.csv', 'watchlist'],
  ['Letterboxd export.csv answered "watched"', 'letterboxd', 'export.csv', 'letterboxd-watched.csv', 'watched'],
  ['Letterboxd ratings.csv', 'letterboxd', 'ratings.csv', 'letterboxd-ratings.csv', null],
];

async function run() {
  const password = randomBytes(24).toString('hex');
  const uid = prepareAccount(password);
  console.log(`account ready (${uid.slice(0, 8)})`);

  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(URL_BASE, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email: EMAIL, password });
  // Thrown, not exited, so the account is still emptied below.
  if (signedIn.error || signedIn.data.session?.user?.id !== uid) throw new Error(`Could not sign in to the Staging import account: ${signedIn.error?.message || 'wrong account'}`);
  const session = signedIn.data.session;

  const { configure } = await import('../packages/core/config.js');
  configure({ supabaseUrl: URL_BASE, supabaseAnonKey: publishable, supabaseClient: client, importEventsEnabled: true, importAnnotationsEnabled: true });
  const { startFileImport } = await import('../packages/core/importJobs.js');
  const { callAuthenticatedFunction } = await import('../packages/core/functions.js');

  let failures = 0;
  for (const [label, source, name, file, listChoice] of CASES) {
    const { job, error } = await startFileImport({ userId: uid, source, entry: 'import_page', listChoice, files: [{ name, body: fixture(file), contentType: 'text/csv' }] });
    if (error || !job) { failures++; console.log(`FAIL ${label}: could not start (${String(error?.message).slice(0, 160)})`); continue; }
    let row = null;
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_MS));
      const { data } = await client.from('import_jobs').select('status,phase,imported,duplicates,failed,review_count,last_error').eq('id', job.id).maybeSingle();
      row = data;
      if (row && ['succeeded', 'partial', 'failed', 'cancelled'].includes(row.status)) break;
      // Home nudges the worker on every poll; so does this.
      await callAuthenticatedFunction('import-worker', session, { job: job.id }).catch(() => {});
    }
    const ok = row?.status === 'succeeded' && row.imported > 0 && row.failed === 0;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: status=${row?.status ?? 'timed out'} imported=${row?.imported ?? 0} duplicates=${row?.duplicates ?? 0} failed=${row?.failed ?? 0}${row?.last_error ? ` error="${String(row.last_error).slice(0, 160)}"` : ''}`);
  }

  // What the account can see of its own data afterwards: the saves landed
  // where a person would look for them.
  const count = async table => (await client.from(table).select('id', { count: 'exact', head: true }).eq('user_id', uid)).count ?? 0;
  const saved = { history: await count('history'), watch_events: await count('watch_events'), imported_annotations: await count('imported_annotations') };
  const landed = saved.history >= 5 && saved.watch_events >= 5 && saved.imported_annotations >= 2;
  if (!landed) failures++;
  console.log(`${landed ? 'PASS' : 'FAIL'} the account now holds ${saved.history} watched titles, ${saved.watch_events} watch records and ${saved.imported_annotations} imported ratings`);

  await client.auth.signOut({ scope: 'local' }).catch(() => {});
  return failures;
}

let failures = 1;
try {
  failures = await run();
} catch (error) {
  console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
} finally {
  emptyAccount();
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `✗ ${failures} import check(s) failed on Staging` : '✓ every file imported end to end on Staging');
process.exit(failures ? 1 : 0);

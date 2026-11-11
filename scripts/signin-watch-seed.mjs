// Seed (or re-seed) the production signed-in check's session.
//
// uptime-watch's production check can't sign in with a password: production
// sign-in requires a Turnstile captcha. Instead it renews a stored session
// every run (apps/web/workers/uptime-watch/src/signin.js). This script makes
// the first session, without a captcha, and stores it where the Worker reads it:
//
//   1. (with --create) creates the watcher account, confirmed and with no
//      password, through the auth admin API. Creating it sends the usual
//      "new signup" email and adds it to Brevo's app-users list. Brevo's
//      lifecycle emails skip it because it never finishes onboarding.
//   2. makes a one-time magic link for it (the admin API returns the link
//      instead of emailing it) and exchanges it for a session at /verify,
//      which does not ask for a captcha;
//   3. puts the session's refresh token in uptime-watch's STATE namespace
//      under `signin-prod-session`. Nothing is printed.
//
// It only ever touches plot-signin-watch@example.invalid, refuses any project
// but production, and needs --yes-production, because it writes to live auth.
// Run it from the main checkout (it reads SUPABASE_URL and
// SUPABASE_SERVICE_KEY from .env) with a wrangler login for the Plot account:
//
//   node scripts/signin-watch-seed.mjs --yes-production            # re-seed
//   node scripts/signin-watch-seed.mjs --yes-production --create   # first time
//
// Re-seed whenever the "signed-in check can't run in production" email says
// the stored session is gone. Re-seeding replaces the token; it does not
// create a second account.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PRODUCTION_HOST = 'mkegtssedjyqldysvzga.supabase.co';
const EMAIL = 'plot-signin-watch@example.invalid';
const KV_NAMESPACE_ID = 'a8899df7a9734917a4710f48167351c0'; // uptime-watch-state, see its wrangler.toml
const KV_KEY = 'signin-prod-session'; // PROD_SESSION_KEY in signin.js
const WORKER_DIR = resolve('apps/web/workers/uptime-watch');

if (!process.argv.includes('--yes-production')) {
  console.error('This writes to production auth. Re-run with --yes-production once Savannah has said yes.');
  process.exit(1);
}
const create = process.argv.includes('--create');

function envValue(name) {
  const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, '') : null;
}

const url = envValue('SUPABASE_URL');
const serviceKey = envValue('SUPABASE_SERVICE_KEY');
if (!url || new URL(url).hostname !== PRODUCTION_HOST) throw new Error('SUPABASE_URL in .env is not Plot production; refusing.');
if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY missing from .env.');

const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
async function call(path, body) {
  const res = await fetch(`${url}/auth/v1/${path}`, { method: 'POST', headers: admin, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

if (create) {
  const { res, json } = await call('admin/users', { email: EMAIL, email_confirm: true });
  if (res.ok) console.log(`Created ${EMAIL} (${json.id}).`);
  else if (json.error_code === 'email_exists' || res.status === 422) console.log(`${EMAIL} already exists; reusing it.`);
  else throw new Error(`create failed: HTTP ${res.status} ${json.error_code || json.msg || ''}`);
}

const link = await call('admin/generate_link', { type: 'magiclink', email: EMAIL });
const hashed = link.json.hashed_token || link.json.properties?.hashed_token;
if (!link.res.ok || !hashed) {
  throw new Error(`magic link failed: HTTP ${link.res.status} ${link.json.error_code || link.json.msg || ''}${create ? '' : ' (first run? add --create)'}`);
}

const verify = await call('verify', { type: 'magiclink', token_hash: hashed });
const session = verify.json;
if (!verify.res.ok || !session.refresh_token) throw new Error(`verify failed: HTTP ${verify.res.status} ${session.error_code || session.msg || ''}`);
if (session.user?.email?.toLowerCase() !== EMAIL) throw new Error('verify returned a different account; refusing to store it.');

const dir = mkdtempSync(join(tmpdir(), 'signin-seed-'));
const file = join(dir, 'token');
try {
  writeFileSync(file, session.refresh_token, { mode: 0o600 });
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', KV_KEY, '--path', file, '--namespace-id', KV_NAMESPACE_ID, '--remote'], {
    cwd: WORKER_DIR,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`Stored a fresh session for ${EMAIL} (user ${session.user.id}). The next hourly run will use it.`);

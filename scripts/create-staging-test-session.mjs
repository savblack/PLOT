import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'uzrhfivnhdcfieuaxzip';
const EMAIL_SERVICE = 'com.theplot.staging.test.email';
const PASSWORD_SERVICE = 'com.theplot.staging.test.password';
const allowedOrigins = new Set([
  'http://localhost:5177',
  'http://127.0.0.1:5177',
  'https://preview.theplot.tv',
]);

function usage() {
  console.log(`Create a local Playwright login state for the PLOT Staging account.

Before running this, create two Password items in Keychain Access:
  ${EMAIL_SERVICE}      the staging account email
  ${PASSWORD_SERVICE}   the staging account password

Usage:
  npm run staging:session
  npm run staging:session -- --origin https://preview.theplot.tv

The output is written under .playwright/, which is gitignored. Never share it.`);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function envValue(name) {
  const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  if (!line) return null;
  return line.slice(name.length + 1).replace(/^['"]|['"]$/g, '');
}

function keychainValue(service) {
  try {
    return execFileSync('security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(`Missing Keychain item: ${service}. Open Keychain Access and add it as a Password item.`);
  }
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

const origin = argument('--origin') ?? 'http://localhost:5177';
if (!allowedOrigins.has(origin)) {
  throw new Error(`Unsupported origin: ${origin}`);
}

const supabaseUrl = envValue('VITE_SUPABASE_URL');
const supabaseAnonKey = envValue('VITE_SUPABASE_ANON_KEY');
if (new URL(supabaseUrl ?? '').hostname !== `${STAGING_REF}.supabase.co`) {
  throw new Error('Refusing to create a session because .env is not configured for PLOT Staging.');
}
if (!supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env.');

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const { data, error } = await supabase.auth.signInWithPassword({
  email: keychainValue(EMAIL_SERVICE),
  password: keychainValue(PASSWORD_SERVICE),
});
if (error || !data.session) throw new Error(`Staging sign-in failed: ${error?.message ?? 'no session returned'}`);

const storageKey = `sb-${STAGING_REF}-auth-token`;
const filename = `staging-${new URL(origin).hostname.replaceAll('.', '-')}-${new URL(origin).port || '443'}.json`;
const outputPath = resolve('.playwright', filename);
const state = {
  cookies: [],
  origins: [{
    origin,
    localStorage: [{ name: storageKey, value: JSON.stringify(data.session) }],
  }],
};

mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputPath, 0o600);
console.log(`Created an ignored staging session for ${origin}.`);

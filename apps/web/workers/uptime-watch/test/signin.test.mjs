import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFLICT_TARGET, MARKER, pickTitle, signedInReadWrite } from '../src/signin.js';
import { emailContent, run, signinChecksFor, watchFor } from '../src/index.js';

const UID = 'user-1';
const env = {
  SIGNIN_SUPABASE_URL: 'https://staging.example/',
  SIGNIN_PUBLISHABLE_KEY: 'pk',
  SIGNIN_EMAIL: 'watch@example.invalid',
  SIGNIN_PASSWORD: 'pw',
};
// Ids taken from this fake trending response, not real TMDB ids.
const TRENDING = {
  results: [
    { id: 11, media_type: 'person', name: 'Someone' },
    { id: 22, media_type: 'tv', name: 'A Show' },
    { id: 33, media_type: 'movie', title: 'A Film', poster_path: '/p.jpg' },
  ],
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * A fake Supabase. Each route answers healthily unless `faults` overrides it,
 * and every request is recorded so tests can assert what was sent.
 */
function fakeSupabase({ faults = {}, history = [] } = {}) {
  const calls = [];
  const http = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    calls.push({ key, url: u, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (faults[key]) return faults[key](u, init);
    switch (key) {
      case 'POST /auth/v1/token': return json(200, { access_token: 'jwt', user: { id: UID } });
      case 'POST /auth/v1/logout': return new Response(null, { status: 204 });
      case 'GET /rest/v1/profiles': return json(200, [{ id: UID }]);
      case 'GET /rest/v1/history': return json(200, history);
      case 'POST /rest/v1/history': return json(201, [{ id: 99, ...JSON.parse(init.body) }]);
      case 'DELETE /rest/v1/history': return json(200, [{ id: 99 }]);
      default: throw new Error(`unexpected ${key}`);
    }
  };
  return { http, calls };
}

const runOnce = (sb, trending = async () => TRENDING) => signedInReadWrite(env, { http: sb.http, trending, now: () => new Date('2026-11-11T00:00:00Z') });

test('conflict target matches the one the app writes with', () => {
  const core = readFileSync(new URL('../../../../../packages/core/userMedia.js', import.meta.url), 'utf8');
  assert.match(core, new RegExp(`HISTORY_CONFLICT_TARGET = '${CONFLICT_TARGET}'`));
});

test('healthy path: sign in, read, write a marked row, delete it, sign out', async () => {
  const sb = fakeSupabase();
  const r = await runOnce(sb);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(sb.calls.map((c) => c.key), [
    'POST /auth/v1/token',
    'GET /rest/v1/profiles',
    'GET /rest/v1/history',
    'POST /rest/v1/history',
    'DELETE /rest/v1/history',
    'POST /auth/v1/logout',
  ]);
  const write = sb.calls[3];
  assert.equal(write.url.searchParams.get('on_conflict'), CONFLICT_TARGET);
  assert.match(write.init.headers.Prefer, /resolution=merge-duplicates/);
  assert.equal(write.init.headers.Authorization, 'Bearer jwt');
  assert.deepEqual(write.body, {
    user_id: UID, tmdb_id: 33, media_type: 'movie', title: 'A Film', poster_path: '/p.jpg',
    watched_at: '2026-11-11T00:00:00.000Z', note: MARKER,
  });
  assert.equal(sb.calls[4].url.searchParams.get('id'), 'eq.99');
  assert.equal(sb.calls[0].body.email, 'watch@example.invalid');
});

test('a July-style write failure is reported as broken, with the Postgres code', async () => {
  const sb = fakeSupabase({
    faults: {
      'POST /rest/v1/history': () => json(400, { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' }),
    },
  });
  const r = await runOnce(sb);
  assert.equal(r.ok, false);
  assert.ok(!r.blocked);
  assert.match(r.reason, /^write failed: HTTP 400 \(42P10: there is no unique/);
  assert.equal(sb.calls.at(-1).key, 'POST /auth/v1/logout', 'still signs out');
});

test('each step names itself when it fails', async () => {
  const cases = [
    [{ 'POST /auth/v1/token': () => json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) }, /^sign-in failed: HTTP 400 \(invalid_credentials/],
    [{ 'GET /rest/v1/profiles': () => json(200, []) }, /own profile row not returned/],
    [{ 'GET /rest/v1/history': () => json(500, { code: 'XX000', message: 'boom' }) }, /^read \(history\) failed: HTTP 500/],
    [{ 'POST /rest/v1/history': () => json(201, []) }, /no row came back/],
    [{ 'DELETE /rest/v1/history': () => json(200, []) }, /the row was not removed/],
    [{ 'DELETE /rest/v1/history': () => json(403, { code: '42501', message: 'permission denied' }) }, /^delete failed: HTTP 403 \(42501/],
  ];
  for (const [faults, pattern] of cases) {
    const r = await runOnce(fakeSupabase({ faults }));
    assert.equal(r.ok, false);
    assert.match(r.reason, pattern);
  }
});

test('leftover marker rows from an interrupted run are deleted first, real rows are left alone', async () => {
  const sb = fakeSupabase({
    history: [
      { id: 5, tmdb_id: 33, media_type: 'movie', note: MARKER },
      { id: 6, tmdb_id: 22, media_type: 'tv', note: null },
    ],
  });
  const r = await runOnce(sb);
  assert.equal(r.ok, true, r.reason);
  const deletes = sb.calls.filter((c) => c.key === 'DELETE /rest/v1/history');
  assert.equal(deletes[0].url.searchParams.get('id'), 'in.(5)');
  // 33 was only a leftover, so it is free again; 22 belongs to a real row.
  assert.equal(sb.calls.find((c) => c.key === 'POST /rest/v1/history').body.tmdb_id, 33);
});

test('no trending title means the watcher could not look, not that Plot is down', async () => {
  const empty = await runOnce(fakeSupabase(), async () => ({ results: [] }));
  assert.equal(empty.blocked, true);
  const down = await runOnce(fakeSupabase(), async () => { throw new Error('TMDB proxy HTTP 502'); });
  assert.equal(down.blocked, true);
  assert.match(down.reason, /TMDB proxy HTTP 502/);
});

test('pickTitle prefers a movie, skips people and titles already logged', () => {
  assert.equal(pickTitle(TRENDING, new Set()).tmdb_id, 33);
  assert.equal(pickTitle(TRENDING, new Set(['movie:33'])).tmdb_id, 22);
  assert.equal(pickTitle(TRENDING, new Set(['movie:33', 'tv:22'])), null);
  assert.equal(pickTitle(null, new Set()), null);
});

test('signinChecksFor: off without a URL, "not configured" without secrets', async () => {
  assert.deepEqual(signinChecksFor({}), []);
  const [half] = signinChecksFor({ SIGNIN_SUPABASE_URL: 'https://x' });
  const r = await half.read();
  assert.equal(r.blocked, true);
  assert.match(r.reason, /SIGNIN_PUBLISHABLE_KEY, SIGNIN_EMAIL, SIGNIN_PASSWORD unset/);
});

test('the hourly cron runs the signed-in watch, and wrangler.toml agrees', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const cron = toml.match(/^SIGNIN_CRON = "([^"]+)"/m)[1];
  const crons = JSON.parse(toml.match(/^crons = (\[.*\])$/m)[1]);
  assert.ok(crons.includes(cron), 'SIGNIN_CRON is one of the triggers');
  assert.equal(watchFor(cron, { SIGNIN_CRON: cron }), 'signin');
  assert.equal(watchFor('*/5 * * * *', { SIGNIN_CRON: cron }), 'uptime');
  assert.equal(watchFor(cron, {}), 'uptime');
});

/** Memory KV and a fetch that records Resend calls, for end-to-end runs. */
function harness() {
  const store = new Map();
  const STATE = {
    get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    put: async (k, v) => { store.set(k, v); },
  };
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      sent.push(JSON.parse(init.body));
      return json(200, { id: 'email' });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { store, STATE, sent, restore: () => { globalThis.fetch = realFetch; } };
}

test('a broken write sends the down email once, then the recovery email', async () => {
  const h = harness();
  try {
    const base = { ...env, STATE: h.STATE, RESEND_API_KEY: 'k', ALERT_EMAIL: 'a@example.invalid', ALERT_FROM: 'Plot <x@example.invalid>', ATTEMPTS: '2', WAIT_SECONDS: '0' };
    const broken = fakeSupabase({ faults: { 'POST /rest/v1/history': () => json(400, { code: '42P10', message: 'no matching constraint' }) } });
    const deps = (sb) => ({ http: sb.http, trending: async () => TRENDING, wait: async () => {} });

    const first = await run(base, 'signin', deps(broken));
    assert.equal(first.verdict.state, 'broken');
    assert.equal(first.email, 'down');
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].subject, 'Plot: saving to History is failing on Staging');
    assert.match(h.sent[0].html, /42P10/);
    assert.ok(h.store.has('signin-state'), 'own state key');
    assert.ok(!h.store.has('state'), 'uptime state untouched');

    const second = await run(base, 'signin', deps(broken));
    assert.equal(second.email, null, 'no repeat email within the reminder window');

    const healed = await run(base, 'signin', deps(fakeSupabase()));
    assert.equal(healed.email, 'recovered');
    assert.equal(h.sent.at(-1).subject, 'Plot: saving to History works again on Staging');
  } finally {
    h.restore();
  }
});

test('signed-in emails: subject, no em dash, reason escaped', () => {
  for (const kind of ['down', 'reminder', 'recovered', 'blind', 'test']) {
    const { subject, html } = emailContent({ kind, reason: 'r', since: 0 }, { now: 36e5, watch: 'signin' });
    assert.ok(subject.startsWith('Plot: '), kind);
    assert.ok(!/—/.test(subject + html), `${kind} contains an em dash`);
  }
  assert.match(emailContent({ kind: 'down', reason: '<b>x</b>' }, { now: 0, watch: 'signin' }).html, /&lt;b&gt;x/);
});

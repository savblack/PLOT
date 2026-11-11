import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { STALE_MINUTES, readDbChecks, startDbChecks } from '../src/dbChecks.js';
import { dbChecksChecksFor, emailContent, run } from '../src/index.js';

const NOW = Date.parse('2026-11-11T13:23:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'savblack/PLOT', DB_CHECKS_WORKFLOW: 'cron-health.yml' };

/** A fake GitHub: dispatch answers `dispatch`, the runs list returns `runs`. */
function fakeGithub({ dispatch = 204, runs = [{ created_at: minutesAgo(30), conclusion: 'success' }], list = 200 } = {}) {
  const calls = [];
  const http = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body, auth: init.headers?.Authorization });
    if (String(url).endsWith('/actions/workflows/cron-health.yml/dispatches')) return json(dispatch);
    if (String(url).includes('/actions/workflows/cron-health.yml/runs?status=completed')) {
      return list === 200 ? json(200, { workflow_runs: runs }) : json(list, { message: 'nope' });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { http, calls };
}

test('start asks GitHub for a workflow_dispatch on main, and only that workflow', async () => {
  const gh = fakeGithub();
  assert.deepEqual(await startDbChecks(env, gh.http), { ok: true, status: 204 });
  assert.equal(gh.calls.length, 1);
  assert.equal(gh.calls[0].url, 'https://api.github.com/repos/savblack/PLOT/actions/workflows/cron-health.yml/dispatches');
  assert.equal(gh.calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(gh.calls[0].body), { ref: 'main' });
  assert.equal(gh.calls[0].auth, 'Bearer t');
});

test('a run that finished recently is healthy', async () => {
  const r = await readDbChecks(env, { started: { ok: true, status: 204 }, now: NOW, http: fakeGithub().http });
  assert.equal(r.ok, true);
  assert.match(r.reason, /30 minutes ago \(success\)/);
});

test('no finished run for longer than STALE_MINUTES means the checks stopped (broken)', async () => {
  const gh = fakeGithub({ runs: [{ created_at: minutesAgo(STALE_MINUTES + 1), conclusion: 'success' }] });
  const r = await readDbChecks(env, { started: { ok: true, status: 204 }, now: NOW, http: gh.http });
  assert.equal(r.ok, false);
  assert.ok(!r.blocked);
  assert.match(r.reason, /181 minutes ago/);
  const edge = fakeGithub({ runs: [{ created_at: minutesAgo(STALE_MINUTES), conclusion: 'failure' }] });
  assert.equal((await readDbChecks(env, { started: { ok: true }, now: NOW, http: edge.http })).ok, true,
    'a failed run still counts as running: cron-health.yml raises its own alarm for that');
});

test('no finished run at all is broken', async () => {
  const r = await readDbChecks(env, { started: { ok: true }, now: NOW, http: fakeGithub({ runs: [] }).http });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no run of cron-health.yml that actually checked anything/);
});

test('a token without the Actions permission is "can\'t run" with the fix, never an outage', async () => {
  // GitHub answers 403 without the permission, 401 for an expired token.
  for (const status of [401, 403]) {
    const listRefused = await readDbChecks(env, { started: { ok: false, status, reason: `GitHub would not start it (${status})` }, now: NOW, http: fakeGithub({ list: status }).http });
    assert.equal(listRefused.blocked, true, String(status));
    assert.match(listRefused.reason, /Actions: Read and write/);
  }
  // Start refused but GitHub's own schedule ran it recently: healthy, with a note.
  const recent = await readDbChecks(env, { started: { ok: false, status: 403, reason: 'GitHub would not start it (403)' }, now: NOW, http: fakeGithub().http });
  assert.equal(recent.ok, true);
  assert.match(recent.reason, /Actions: Read and write/);
  // Start refused and stale: the watcher's setup is the problem, so blocked.
  const stale = await readDbChecks(env, { started: { ok: false, status: 403, reason: 'GitHub would not start it (403)' }, now: NOW, http: fakeGithub({ runs: [{ created_at: minutesAgo(400), conclusion: 'success' }] }).http });
  assert.equal(stale.blocked, true);
  const none = await readDbChecks(env, { started: { ok: false, status: 403, reason: 'GitHub would not start it (403)' }, now: NOW, http: fakeGithub({ runs: [] }).http });
  assert.equal(none.blocked, true, 'no usable run and a refused start: still the watcher\'s setup');
});

test('dbChecksChecksFor: off without the workflow var, "not configured" without a token', async () => {
  assert.deepEqual(dbChecksChecksFor({ ...env, DB_CHECKS_WORKFLOW: '' }, null), []);
  const [c] = dbChecksChecksFor({ ...env, GITHUB_TOKEN: '' }, null);
  const r = await c.read();
  assert.equal(r.blocked, true);
  assert.match(r.reason, /not configured/);
});

function harness() {
  const store = new Map();
  const STATE = {
    get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
    put: async (k, v) => { store.set(k, v); },
  };
  const sent = [];
  const issues = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      sent.push(JSON.parse(init.body));
      return json(200, { id: 'email' });
    }
    if (String(url).startsWith('https://api.github.com/repos/savblack/PLOT/issues')) {
      issues.push({ url: String(url), method: init.method, body: init.body && JSON.parse(init.body) });
      return json(201, { number: 77 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { store, STATE, sent, issues, restore: () => { globalThis.fetch = realFetch; } };
}

test('stopped checks: one "stopped" email and issue, its own state, then a recovery email', async () => {
  const h = harness();
  try {
    const base = { ...env, STATE: h.STATE, RESEND_API_KEY: 'k', ALERT_EMAIL: 'a@example.invalid', ALERT_FROM: 'Plot <x@example.invalid>', ATTEMPTS: '2', WAIT_SECONDS: '0' };
    const deps = (gh) => ({ github: gh.http, now: () => NOW, wait: async () => {} });
    const stale = fakeGithub({ runs: [{ created_at: minutesAgo(500), conclusion: 'success' }] });

    const first = await run(base, 'dbchecks', deps(stale));
    assert.equal(first.verdict.state, 'broken');
    assert.equal(first.email, 'down');
    assert.deepEqual(first.started, { ok: true, status: 204 });
    assert.equal(stale.calls.filter((c) => c.method === 'POST').length, 1, 'started once, even though the read was retried');
    assert.equal(h.sent[0].subject, 'Plot: the hourly database checks have stopped running');
    assert.equal(h.issues[0].body.labels[0], 'incident');
    assert.ok(h.store.has('dbchecks-state'), 'own state key');
    assert.ok(!h.store.has('state') && !h.store.has('signin-state'), 'other watches untouched');

    assert.equal((await run(base, 'dbchecks', deps(stale))).email, null, 'no repeat within the reminder window');

    const healed = await run(base, 'dbchecks', deps(fakeGithub()));
    assert.equal(healed.email, 'recovered');
    assert.equal(h.sent.at(-1).subject, 'Plot: the hourly database checks are running again');
  } finally {
    h.restore();
  }
});

test('database check emails: subject, no em dash, reason escaped, blind email says how to fix', () => {
  for (const kind of ['down', 'reminder', 'recovered', 'blind', 'test']) {
    const { subject, html } = emailContent({ kind, reason: 'r', since: 0 }, { now: 36e5, watch: 'dbchecks' });
    assert.ok(subject.startsWith('Plot: '), kind);
    assert.ok(!/—/.test(subject + html), `${kind} contains an em dash`);
  }
  assert.match(emailContent({ kind: 'down', reason: '<b>x</b>' }, { now: 0, watch: 'dbchecks' }).html, /&lt;b&gt;x/);
  assert.match(emailContent({ kind: 'blind', reason: 'r', since: 0 }, { now: 0, watch: 'dbchecks' }).html, /Actions: Read and write/);
});

test('wrangler.toml names the workflow, and that workflow exists and can be started by hand', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const name = /^DB_CHECKS_WORKFLOW = "([^"]+)"/m.exec(toml)?.[1];
  assert.equal(name, 'cron-health.yml');
  const wf = readFileSync(new URL(`../../../../../.github/workflows/${name}`, import.meta.url), 'utf8');
  assert.match(wf, /workflow_dispatch:/, 'a workflow without workflow_dispatch cannot be started');
});

test('cancelled and never-started runs do not count: a queue that cancels every run is an alarm', async () => {
  const gh = fakeGithub({ runs: [
    { created_at: minutesAgo(5), conclusion: 'cancelled' },
    { created_at: minutesAgo(65), conclusion: 'startup_failure' },
    { created_at: minutesAgo(400), conclusion: 'success' },
  ] });
  const r = await readDbChecks(env, { started: { ok: true, status: 204 }, now: NOW, http: gh.http });
  assert.equal(r.ok, false);
  assert.ok(!r.blocked);
  assert.match(r.reason, /400 minutes ago/);
  const onlyCancelled = fakeGithub({ runs: [{ created_at: minutesAgo(5), conclusion: 'cancelled' }] });
  assert.equal((await readDbChecks(env, { started: { ok: true }, now: NOW, http: onlyCancelled.http })).ok, false);
});

test('a missing workflow (404) is an outage with the right fix, not a token problem', async () => {
  const r = await readDbChecks(env, { started: { ok: false, status: 404, reason: 'GitHub would not start it (404)' }, now: NOW, http: fakeGithub({ list: 404 }).http });
  assert.equal(r.ok, false);
  assert.ok(!r.blocked, 'broken, so it emails at once and opens an issue');
  assert.match(r.reason, /renamed or deleted/);
  assert.doesNotMatch(r.reason, /Actions: Read and write/);
});

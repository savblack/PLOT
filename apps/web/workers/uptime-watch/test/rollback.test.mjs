import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseRollback, describeDeployment, maybeRollback, rollbackEmail } from '../src/rollback.js';
import { classify, entryScripts } from '../src/index.js';

const MIN = 60_000;
const now = Date.parse('2026-11-12T12:00:00Z');
const at = (minsAgo) => new Date(now - minsAgo * MIN).toISOString();
const dep = (id, minsAgo, status = 'success', extra = {}) => ({
  id,
  created_on: at(minsAgo),
  environment: 'production',
  latest_stage: { name: 'deploy', status },
  deployment_trigger: { metadata: { commit_hash: `${id}0000000abc`, commit_message: `commit ${id}\nbody` } },
  ...extra,
});
const base = { state: null, now, windowMinutes: 30, maxPerDay: 3 };

test('a fresh live deploy rolls back to the newest earlier working one', () => {
  const live = dep('c', 5);
  const d = chooseRollback({ ...base, live, deployments: [live, dep('b', 60, 'failure'), dep('a', 120), dep('z', 300)] });
  assert.equal(d.action, 'rollback');
  assert.equal(d.to.id, 'a', 'skips the failed build b');
});

test('a live version older than the window is left alone', () => {
  const live = dep('c', 45);
  const d = chooseRollback({ ...base, live, deployments: [live, dep('a', 120)] });
  assert.equal(d.action, 'none');
  assert.match(d.reason, /45 minutes ago/);
});

test('never rolls back from the same deployment twice, nor onto one it left', () => {
  const live = dep('c', 5);
  assert.equal(chooseRollback({ ...base, live, deployments: [live, dep('a', 120)], state: { bad: ['c'] } }).action, 'none');
  const d = chooseRollback({ ...base, live, deployments: [live, dep('b', 60), dep('a', 120)], state: { bad: ['b'] } });
  assert.equal(d.to.id, 'a');
});

test('stops after the daily cap, counting only the last 24 hours', () => {
  const live = dep('c', 5);
  const deployments = [live, dep('a', 120)];
  const capped = { history: [now - 1 * MIN, now - 60 * MIN, now - 600 * MIN] };
  assert.match(chooseRollback({ ...base, live, deployments, state: capped }).reason, /3 times in 24 hours/);
  const old = { history: [now - 25 * 60 * MIN, now - 60 * MIN, now - 600 * MIN] };
  assert.equal(chooseRollback({ ...base, live, deployments, state: old }).action, 'rollback');
});

test('nothing earlier, or no live deployment, means no rollback', () => {
  const live = dep('c', 5);
  assert.equal(chooseRollback({ ...base, live, deployments: [live, dep('d', 1)] }).action, 'none', 'a newer one is not a rollback');
  assert.equal(chooseRollback({ ...base, live: null, deployments: [] }).action, 'none');
  assert.equal(chooseRollback({ ...base, live, deployments: [live, dep('p', 60, 'success', { environment: 'preview' })] }).action, 'none');
});

const env = { ROLLBACK: 'on', CF_PAGES_TOKEN: 't', CF_ACCOUNT_ID: 'acct', PAGES_PROJECT: 'plot' };
const fakeCf = (routes, calls) => async (url, init = {}) => {
  calls.push(`${init.method || 'GET'} ${url.replace(/^.*\/projects\/plot/, '')}`);
  const key = Object.keys(routes).find((k) => url.endsWith(k) && (routes[k].method || 'GET') === (init.method || 'GET'));
  const r = routes[key] ?? { status: 404, json: { success: false, errors: [{ message: 'not found' }] } };
  return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
};

test('maybeRollback posts the rollback and records what it left', async () => {
  const live = dep('c', 5);
  const calls = [];
  const http = fakeCf({
    '/plot': { json: { success: true, result: { canonical_deployment: live } } },
    '/deployments?env=production': { json: { success: true, result: [live, dep('a', 120)] } },
    '/deployments/a/rollback': { method: 'POST', json: { success: true, result: {} } },
  }, calls);
  const r = await maybeRollback(env, { now, state: null, http });
  assert.equal(r.action, 'rollback');
  assert.deepEqual(calls, ['GET ', 'GET /deployments?env=production', 'POST /deployments/a/rollback']);
  assert.deepEqual(r.state.bad, ['c']);
  assert.deepEqual(r.state.history, [now]);
});

test('maybeRollback is off without the switch or the token, and reports a refused rollback', async () => {
  assert.equal((await maybeRollback({ ...env, ROLLBACK: 'off' }, { now, state: null })).action, 'off');
  assert.match((await maybeRollback({ ...env, CF_PAGES_TOKEN: '' }, { now, state: null })).reason, /CF_PAGES_TOKEN/);
  const live = dep('c', 5);
  const http = fakeCf({
    '/plot': { json: { success: true, result: { canonical_deployment: live } } },
    '/deployments?env=production': { json: { success: true, result: [live, dep('a', 120)] } },
    '/deployments/a/rollback': { method: 'POST', status: 403, json: { success: false, errors: [{ message: 'Authentication error' }] } },
  }, []);
  const r = await maybeRollback(env, { now, state: null, http });
  assert.equal(r.action, 'failed');
  assert.match(r.reason, /Authentication error/);
  assert.equal(r.state, undefined, 'a failed attempt records nothing, so the next run retries');
});

test('emails name both versions, escape, and use no em dash', () => {
  const from = dep('c', 5);
  const to = dep('a', 120);
  assert.equal(describeDeployment(from), 'c000000 (commit c)');
  for (const action of ['rollback', 'failed']) {
    const { subject, html } = rollbackEmail({ action, from, to, reason: 'nope' }, { reason: '<b>x</b>' });
    assert.ok(subject.startsWith('Plot: '));
    assert.ok(!/—/.test(subject + html));
    assert.ok(!html.includes('<b>x</b>'));
  }
  assert.match(rollbackEmail({ action: 'rollback', from, to }, { reason: 'r' }).html, /c000000.*a000000/s);
});

test('entryScripts finds the module script and the app check needs it to be JavaScript', () => {
  const html = '<script src="/boot/theme.js"></script><script async type="module" crossorigin src="/assets/index-1Ltf.js"></script>' +
    '<script type="module" src="https://evil.example/x.js"></script>';
  assert.deepEqual(entryScripts(html), ['/assets/index-1Ltf.js']);
  assert.equal(classify.appScript(200, 'application/javascript', '/a.js').ok, true);
  assert.match(classify.appScript(200, 'text/html; charset=utf-8', '/a.js').reason, /missing/);
  assert.match(classify.appScript(404, null, '/a.js').reason, /HTTP 404/);
});

test('worker: a fresh deploy that loses its main script is rolled back once, with an email and an issue', async () => {
  const { default: worker } = await import('../src/index.js');
  const kv = new Map();
  const STATE = {
    get: async (k, type) => (kv.has(k) ? (type === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null),
    put: async (k, v) => { kv.set(k, v); },
  };
  // The worker reads the real clock, not the fixed `now` above, so this
  // test's deploys are dated from the real time. Dated from `now`, the live
  // deploy stopped being "fresh" once 12:30 UTC on 2026-11-12 had passed.
  const realAt = (minsAgo) => new Date(Date.now() - minsAgo * MIN).toISOString();
  const live = { ...dep('c', 4), created_on: realAt(4) };
  const calls = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    calls.push(`${method} ${url}`);
    if (url === 'https://app.example/') return new Response('<div id="root"></div><script type="module" src="/assets/gone.js"></script>');
    // Pages' fallback: a missing file comes back as the shell.
    if (url === 'https://app.example/assets/gone.js') return new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } });
    if (url.endsWith('/pages/projects/plot')) return Response.json({ success: true, result: { canonical_deployment: live } });
    if (url.endsWith('/deployments?env=production')) return Response.json({ success: true, result: [live, { ...dep('a', 90), created_on: realAt(90) }] });
    if (url.endsWith('/deployments/a/rollback') && method === 'POST') return Response.json({ success: true, result: {} });
    if (url === 'https://api.resend.com/emails') return Response.json({});
    if (url === 'https://api.github.com/repos/o/r/issues' && method === 'POST') return Response.json({ number: 7 });
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  try {
    const env = {
      STATE, WATCH_TOKEN: 't', APP_URL: 'https://app.example/', WAIT_SECONDS: '0', RESEND_API_KEY: 're',
      ALERT_EMAIL: 'a@example.com', ALERT_FROM: 'b@example.com', GITHUB_TOKEN: 'g', GITHUB_REPO: 'o/r', ...env0(),
    };
    const hit = () => worker.fetch(new Request('https://w/', { headers: { 'x-watch-token': 't' } }), env);
    const first = await (await hit()).json();
    assert.equal(first.rollback.action, 'rollback');
    assert.equal(first.rollback.to, 'a');
    assert.equal(calls.filter((c) => c.endsWith('/rollback')).length, 1);
    const issues = calls.filter((c) => c === 'POST https://api.github.com/repos/o/r/issues');
    assert.equal(issues.length, 2, 'the outage issue and the rollback issue');

    // Cloudflare still reports c as live (say the rollback is propagating): no second rollback.
    const second = await (await hit()).json();
    assert.equal(second.rollback.action, 'none');
    assert.equal(calls.filter((c) => c.endsWith('/rollback')).length, 1);
  } finally {
    globalThis.fetch = saved;
  }
});

function env0() {
  return { ROLLBACK: 'on', CF_PAGES_TOKEN: 'tok', CF_ACCOUNT_ID: 'acct', PAGES_PROJECT: 'plot' };
}

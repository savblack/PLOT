import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checksFor, classify, emailContent, verdictFor } from '../src/index.js';

const noWait = async () => {};
const opts = { attempts: 2, waitMs: 0 };
const check = (name, ...reads) => {
  const q = [...reads];
  return { name, label: name, read: async () => q.shift() ?? reads.at(-1) };
};
const ok = { ok: true, reason: 'fine' };
const bad = { ok: false, reason: 'HTTP 500' };
const refused = { ok: false, blocked: true, reason: 'Cloudflare refused (HTTP 403)' };

test('classify: app shell, trending results, functions boolean', () => {
  assert.equal(classify.app(200, '<html><div id="root"></div>').ok, true);
  assert.equal(classify.app(200, '<html>maintenance</html>').ok, false);
  assert.equal(classify.app(502, '').reason, 'HTTP 502');
  assert.equal(classify.tmdb(200, { results: [{ id: 1 }] }).ok, true);
  assert.equal(classify.tmdb(200, { results: [] }).ok, false);
  assert.match(classify.tmdb(403, { error: 'Origin not allowed' }).reason, /Origin not allowed/);
  assert.equal(classify.functions(200, { checkoutAvailable: false }).ok, true);
  assert.equal(classify.functions(200, {}).ok, false);
  assert.equal(classify.functions(401, null).reason, 'HTTP 401');
});

test('checksFor builds only the checks whose URL is set', () => {
  assert.deepEqual(checksFor({}).map((c) => c.name), []);
  assert.deepEqual(
    checksFor({ APP_URL: 'a', TMDB_PROXY_URL: 't', SUPABASE_URL: 's' }).map((c) => c.name),
    ['app', 'tmdb', 'functions'],
  );
});

test('verdict: all healthy is healthy', async () => {
  const v = await verdictFor([check('app', ok), check('tmdb', ok)], opts, noWait);
  assert.equal(v.state, 'healthy');
});

test('verdict: a single failed read that then succeeds is not an outage', async () => {
  const v = await verdictFor([check('app', bad, ok)], opts, noWait);
  assert.equal(v.state, 'healthy');
});

test('verdict: any check broken on every read makes the whole verdict broken, naming it', async () => {
  const v = await verdictFor([check('app', ok), check('tmdb', bad, bad)], opts, noWait);
  assert.equal(v.state, 'broken');
  assert.match(v.reason, /^tmdb: HTTP 500$/);
});

test('verdict: refusals alone are blocked, but a real failure elsewhere still wins', async () => {
  assert.equal((await verdictFor([check('app', refused)], opts, noWait)).state, 'blocked');
  assert.equal((await verdictFor([check('app', refused), check('tmdb', bad)], opts, noWait)).state, 'broken');
});

test('every email has a subject and no em dash, and escapes the reason', () => {
  for (const kind of ['down', 'reminder', 'recovered', 'blind', 'test']) {
    const { subject, html } = emailContent({ kind, reason: 'r', since: 0 }, { now: 36e5 });
    assert.ok(subject.startsWith('Plot: '), kind);
    assert.ok(!/—/.test(subject + html), `${kind} contains an em dash`);
  }
  assert.match(emailContent({ kind: 'down', reason: '<b>x</b>' }, { now: 0 }).html, /&lt;b&gt;x/);
});

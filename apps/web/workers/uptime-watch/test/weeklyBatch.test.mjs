import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWeeklyBatchHour, startWeeklyBatch, sydneyClock, weeklyBatchEmail } from '../src/weeklyBatch.js';
import { watchFor } from '../src/index.js';

// AEDT (UTC+11): 18:30 UTC Sunday is 5:30 Monday. AEST (UTC+10): 19:30 UTC is.
const AEDT_1830 = Date.parse('2026-11-15T18:30:00Z');
const AEDT_1930 = Date.parse('2026-11-15T19:30:00Z');
const AEST_1830 = Date.parse('2026-06-14T18:30:00Z');
const AEST_1930 = Date.parse('2026-06-14T19:30:00Z');

test('exactly one of the two Sunday UTC firings is 5am Monday in Sydney', () => {
  assert.deepEqual(sydneyClock(AEDT_1830), { hour: 5, weekday: 'Mon' });
  assert.equal(isWeeklyBatchHour(AEDT_1830), true);
  assert.equal(isWeeklyBatchHour(AEDT_1930), false);
  assert.equal(isWeeklyBatchHour(AEST_1830), false);
  assert.equal(isWeeklyBatchHour(AEST_1930), true);
});

const env = { WEEKLY_BATCH_WORKFLOW: 'marketing-weekly-batch.yml', GITHUB_REPO: 'o/r', GITHUB_DISPATCH_TOKEN: 'tok' };

test('dispatches the workflow on main at the right hour, and only then', async () => {
  const calls = [];
  const http = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(null, { status: 204 }); };
  assert.deepEqual(await startWeeklyBatch(env, { now: AEDT_1930, http }), { started: false, skipped: 'not 5am Monday in Sydney' });
  assert.equal(calls.length, 0);
  assert.equal((await startWeeklyBatch(env, { now: AEDT_1830, http })).started, true);
  assert.equal(calls[0].url, 'https://api.github.com/repos/o/r/actions/workflows/marketing-weekly-batch.yml/dispatches');
  assert.deepEqual(calls[0].body, { ref: 'main' });
});

test('a refused dispatch is reported, so the caller emails', async () => {
  const r = await startWeeklyBatch(env, { now: AEDT_1830, http: async () => new Response('', { status: 403 }) });
  assert.equal(r.started, false);
  assert.match(r.reason, /403/);
  const { subject, html } = weeklyBatchEmail(r);
  assert.ok(subject.startsWith('Plot: '));
  assert.ok(!/—/.test(subject + html), 'no em dash');
  assert.equal((await startWeeklyBatch({ ...env, GITHUB_DISPATCH_TOKEN: '' }, { now: AEDT_1830 })).started, false);
});

test('the Sunday cron is routed to the weekly start, not an uptime run', () => {
  const e = { WEEKLY_BATCH_CRON: '30 18,19 * * SUN', SIGNIN_CRON: '23 * * * *' };
  assert.equal(watchFor('30 18,19 * * SUN', e), 'weekly');
  assert.equal(watchFor('23 * * * *', e), 'signin');
  assert.equal(watchFor('*/5 * * * *', e), 'uptime');
});

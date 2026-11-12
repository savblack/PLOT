import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, emailContent, probe } from '../src/index.js';

const H = 36e5;
const T0 = Date.parse('2026-11-06T14:15:00Z');
const OPTS = (now) => ({ now, remindHours: 6, blindHours: 12 });
const healthy = { state: 'healthy', reason: '25 posters' };
const broken = { state: 'broken', reason: 'showing the empty state ("First update lands soon.")' };
const blocked = { state: 'blocked', reason: 'Cloudflare turned the checker away (HTTP 403, cf-mitigated: challenge)' };

/** Feed a sequence of verdicts through decide, returning the emails sent. */
function replay(verdicts, stepHours = 0.5) {
  let state = null;
  const emails = [];
  verdicts.forEach((v, i) => {
    const { next, email } = decide(state, v, OPTS(T0 + i * stepHours * H));
    if (email) emails.push(email.kind);
    state = next;
  });
  return { emails, state };
}

test('a healthy page sends nothing, first run included', () => {
  assert.deepEqual(replay([healthy, healthy, healthy]).emails, []);
});

test('an outage sends one down email and one recovered email, not one per run', () => {
  // The 2026-11-06 shape: about an hour broken.
  const { emails, state } = replay([healthy, broken, broken, broken, healthy, healthy]);
  assert.deepEqual(emails, ['down', 'recovered']);
  assert.equal(state.state, 'healthy');
});

test('recoverAfter: a flapping service sends one down and one recovered, not a pair each time', () => {
  // Down needs two failed reads, so a service failing every other run used to
  // email down, recovered, down, recovered...
  const flapping = [healthy, broken, healthy, broken, healthy, broken, healthy, healthy];
  let state = null;
  const emails = [];
  flapping.forEach((v, i) => {
    const { next, email } = decide(state, v, { ...OPTS(T0 + i * H / 12), recoverAfter: 2 });
    if (email) emails.push(email.kind);
    state = next;
  });
  assert.deepEqual(emails, ['down', 'recovered']);
  assert.equal(state.state, 'healthy');
});

test('recoverAfter defaults to 1, so the recovered email still comes on the first healthy run', () => {
  assert.deepEqual(replay([healthy, broken, healthy]).emails, ['down', 'recovered']);
});

test('a long outage reminds every 6 hours', () => {
  const run = [healthy, ...Array(26).fill(broken)]; // 13 hours broken at 30-minute steps
  assert.deepEqual(replay(run).emails, ['down', 'reminder', 'reminder']);
});

test('blocked runs neither raise nor clear an alarm', () => {
  assert.deepEqual(replay([healthy, blocked, blocked, healthy]).emails, []);
  // Broken, then blocked, then broken again: still the one outage, no second "down".
  assert.deepEqual(replay([healthy, broken, blocked, blocked, broken, healthy]).emails, ['down', 'recovered']);
});

test('a watcher blind for 12 hours says so once, and resets once it can see', () => {
  const blind = Array(30).fill(blocked); // 15 hours
  const { emails, state } = replay([healthy, ...blind]);
  assert.deepEqual(emails, ['blind']);
  assert.equal(state.state, 'healthy');
  const after = decide(state, healthy, OPTS(T0 + 20 * H));
  assert.equal(after.next.blockedSince, null);
  assert.equal(after.next.blindAlerted, false);
});

test('probe: one good read wins, refusals are retried, a bad read beats refusals', async () => {
  const seq = (...rs) => { const q = [...rs]; return async () => q.shift(); };
  const noWait = async () => {};
  const ok = { ok: true, reason: '25 posters' };
  const refused = { ok: false, blocked: true, reason: 'refused' };
  const bad = { ok: false, reason: 'empty' };
  const opts = { attempts: 3, waitMs: 0 };
  assert.equal((await probe('u', opts, seq(refused, refused, ok), noWait)).state, 'healthy');
  assert.equal((await probe('u', opts, seq(refused, refused, refused), noWait)).state, 'blocked');
  const v = await probe('u', opts, seq(bad, refused, refused), noWait);
  assert.deepEqual([v.state, v.reason], ['broken', 'empty']);
});

test('every email has a subject and no em dash (user-facing copy rule)', () => {
  for (const kind of ['down', 'reminder', 'recovered', 'blind', 'test']) {
    const { subject, html } = emailContent({ kind, reason: 'r', since: T0 }, { url: 'https://theplot.tv/whats-on', now: T0 + H });
    assert.ok(subject.startsWith('Plot: '), kind);
    assert.ok(!/—/.test(subject + html), `${kind} contains an em dash`);
  }
  assert.match(emailContent({ kind: 'recovered', reason: 'r', since: T0 }, { url: 'u', now: T0 + H }).html, /about 60 minutes/);
});

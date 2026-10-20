import assert from 'node:assert/strict';
import test from 'node:test';
import { lockIsStale, renderHandoff, secretFindings, STALE_LOCK_MS } from './handoff.mjs';
import { chatExpired, isProtectedName } from './diskPlan.mjs';

const note = {
  title: 'Watchlist empty state',
  status: 'paused',
  branch: 'agent/2026-10-17-watchlist-empty',
  updated: '2026-10-17T04:00:00.000Z',
  next: 'The empty watchlist still shows the wrong sentence. The unit test fails on the empty case.',
};

test('a handoff note renders the next step in plain text', () => {
  const body = renderHandoff(note);
  assert.match(body, /^# Watchlist empty state/);
  assert.match(body, /Status: paused/);
  assert.match(body, /wrong sentence/);
});

test('a handoff note refuses a pasted secret', () => {
  assert.throws(
    () => renderHandoff({ ...note, next: 'Set TMDB_API_KEY=abc123secret and rerun.' }),
    (error) => error.code === 'HANDOFF_SECRET',
  );
  assert.ok(secretFindings('sk_live_51Habc').includes('stripe live key'));
  assert.deepEqual(secretFindings('the password reset screen fails'), []);
});

test('an active lock goes stale only after 12 quiet hours', () => {
  const updated = '2026-10-17T00:00:00.000Z';
  const updatedMs = Date.parse(updated);
  const fresh = lockIsStale({ status: 'active', updated, dirty: false, headCommitMs: updatedMs }, updatedMs + 1000);
  const quiet = lockIsStale({ status: 'active', updated, dirty: false, headCommitMs: updatedMs }, updatedMs + STALE_LOCK_MS + 1);
  const dirty = lockIsStale({ status: 'active', updated, dirty: true, headCommitMs: updatedMs }, updatedMs + STALE_LOCK_MS + 1);
  const moved = lockIsStale({
    status: 'active',
    updated,
    dirty: false,
    headCommitMs: updatedMs + STALE_LOCK_MS,
  }, updatedMs + STALE_LOCK_MS + 1);
  assert.equal(fresh, false);
  assert.equal(quiet, true);
  assert.equal(dirty, false);
  assert.equal(moved, false);
});

test('cleanup never targets the handoff note, and old chats are the ones that expire', () => {
  assert.equal(isProtectedName('AGENT_HANDOFF.md'), true);
  assert.equal(isProtectedName('.plot-session.json'), true);
  assert.equal(isProtectedName('session.jsonl'), false);
  const now = Date.parse('2026-10-17T00:00:00.000Z');
  const day = 24 * 60 * 60 * 1000;
  assert.equal(chatExpired(now - 15 * day, now), true);
  assert.equal(chatExpired(now - 2 * day, now), false);
});

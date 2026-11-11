import assert from 'node:assert/strict';
import test from 'node:test';
import { homeTopCardsAllowed } from '../../homeTopCards.js';
import { importCardsShown } from '../../importJobs.js';

const quiet = { importsLoading: false, importShowing: false, importSeen: false };

test('with no import, the checklist and the Watch together invitation may both show', () => {
  assert.deepEqual(homeTopCardsAllowed(quiet), { checklist: true, watchTogether: true });
});

test('the checklist shows alongside an import; only the invitation waits', () => {
  assert.deepEqual(homeTopCardsAllowed({ ...quiet, importShowing: true }), { checklist: true, watchTogether: false });
  // Seen off: the invitation does not pop in underneath it this visit.
  assert.deepEqual(homeTopCardsAllowed({ ...quiet, importSeen: true }), { checklist: true, watchTogether: false });
});

test('nothing shows until the import jobs have been read', () => {
  assert.deepEqual(homeTopCardsAllowed({ ...quiet, importsLoading: true }), { checklist: false, watchTogether: false });
});

test('Home shows a card for the running import and for finished ones not yet seen off', () => {
  const running = { id: 'a', status: 'running' };
  const done = { id: 'b', status: 'succeeded', seen_at: null };
  const seen = { id: 'c', status: 'succeeded', seen_at: '2026-11-10T00:00:00Z' };
  const queued = { id: 'd', status: 'queued' };
  assert.deepEqual(importCardsShown({ jobs: [running, done, seen, queued], current: running }).map(j => j.id), ['a', 'b']);
  assert.deepEqual(importCardsShown({ jobs: [seen, queued], current: null }), []);
  assert.deepEqual(importCardsShown({ jobs: [], current: null }), []);
});

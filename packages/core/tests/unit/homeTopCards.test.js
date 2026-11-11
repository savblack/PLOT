import assert from 'node:assert/strict';
import test from 'node:test';
import { otherHomeCardsAllowed } from '../../homeTopCards.js';
import { importCardsShown } from '../../importJobs.js';

const quiet = { importsLoading: false, importShowing: false, importSeen: false };

test('with no import, the other Home cards may take the slot', () => {
  assert.equal(otherHomeCardsAllowed(quiet), true);
});

test('an import holds the slot while it shows and for the rest of that visit', () => {
  assert.equal(otherHomeCardsAllowed({ ...quiet, importShowing: true }), false);
  // Seen off: nothing pops in underneath it.
  assert.equal(otherHomeCardsAllowed({ ...quiet, importSeen: true }), false);
});

test('nothing takes the slot until the import jobs have been read', () => {
  assert.equal(otherHomeCardsAllowed({ ...quiet, importsLoading: true }), false);
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

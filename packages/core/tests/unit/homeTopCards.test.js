import assert from 'node:assert/strict';
import test from 'node:test';
import { homeTopCardsAllowed } from '../../homeTopCards.js';
import { importCardsShown } from '../../importJobs.js';

test('the checklist waits only for the first read of import jobs', () => {
  assert.deepEqual(homeTopCardsAllowed({ importsLoading: false }), { checklist: true });
  assert.deepEqual(homeTopCardsAllowed({ importsLoading: true }), { checklist: false });
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

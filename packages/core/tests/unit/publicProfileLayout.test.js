import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProfileLayout, profileHistoryPage } from '../../publicProfileLayout.js';

test('locked profiles suppress all content including lists and ranked picks', () => {
  const item = { title: 'Sample title' };
  const content = publicProfileLayout({ locked: true, topMovies: [item], topTv: [item], recent: [item], favourites: [item], watching: [item], wantToWatch: [item], customLists: [{ items: [item] }] });
  assert.equal(content.empty, true);
  for (const value of Object.values(content)) if (Array.isArray(value)) assert.deepEqual(value, []);
});
test('sparse profiles keep one pick without padding and respect disabled sections', () => {
  const item = { title: 'Sample title' };
  const content = publicProfileLayout({ sections: ['topMovies'], topMovies: [item], recent: [item], favourites: [item], customLists: [{ items: [] }] });
  assert.deepEqual(content.topMovies, [item]);
  assert.deepEqual(content.recent, []);
  assert.deepEqual(content.customLists, []);
  assert.equal(content.empty, false);
  assert.equal(publicProfileLayout({ sections: [], topMovies: [item] }).empty, true);
});
test('top selections respect the existing five-slot limit without modifying data', () => {
  const items = Array.from({ length: 10 }, (_, rank) => ({ rank: rank + 1 }));
  assert.equal(publicProfileLayout({ topMovies: items }).topMovies.length, 5);
  assert.equal(items.length, 10);
});
test('history pagination scopes to the profile owner and uses a stable bounded order', async () => {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'order']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.range = (...args) => { calls.push(['range', ...args]); return { data: [{ title: 'Sample' }], count: 61 }; };
  const result = await profileHistoryPage({ from: () => query }, 'profile-owner', 1);
  assert.equal(result.hasMore, true);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'profile-owner'));
  assert.deepEqual(calls.at(-1), ['range', 30, 59]);
  assert.ok(calls.some(call => call[0] === 'order' && call[1] === 'id'));
});
test('history errors propagate rather than masquerading as empty history', async () => {
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, range() { return { error: new Error('denied') }; } };
  await assert.rejects(profileHistoryPage({ from: () => query }, 'owner'), /denied/);
});

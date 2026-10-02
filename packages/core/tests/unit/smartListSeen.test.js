import assert from 'node:assert/strict';
import test from 'node:test';
import {
  smartMatchKey, mergeSeenKeys, splitNewMatches, openedSmartListRow, smartListNewCounts, SMART_LIST_SEEN_CAP,
} from '../../smartListSeen.js';

// Ids are opaque fixture values, never TMDB lookups.
const m = (id, type = 'movie') => ({ tmdb_id: id, media_type: type });

test('match keys match the server’s', () => {
  assert.equal(smartMatchKey(m(5)), 'movie:5');
  assert.equal(smartMatchKey(m(5, 'tv')), 'tv:5');
});

test('a list never opened has nothing new', () => {
  const { freshKeys, since } = splitNewMatches([m(1), m(2)], null);
  assert.equal(freshKeys.size, 0);
  assert.equal(since, null);
});

test('new means not shown at the last open, including what the roll-up found', () => {
  const row = { list_id: 'l', user_id: 'u', seen_keys: ['movie:1'], pending_keys: ['movie:3'], last_opened_at: '2026-09-22T10:00:00Z' };
  const { freshKeys, since } = splitNewMatches([m(1), m(2), m(3), m(2, 'tv')], row);
  assert.deepEqual([...freshKeys], ['movie:2', 'movie:3', 'tv:2']);
  assert.equal(since, '2026-09-22T10:00:00Z');
});

test('opening a list records what it showed and clears the roll-up’s finds', () => {
  const now = new Date('2026-10-02T09:00:00Z');
  const row = { list_id: 'l', user_id: 'u', seen_keys: ['movie:1', 'movie:9'], pending_keys: ['movie:3'], last_opened_at: null };
  assert.deepEqual(openedSmartListRow({ listId: 'l', userId: 'u', items: [m(3), m(1)], row, now }), {
    list_id: 'l', user_id: 'u', seen_keys: ['movie:3', 'movie:1', 'movie:9'], pending_keys: [], last_opened_at: now.toISOString(),
  });
});

test('opening twice in a row finds nothing new the second time', () => {
  const items = [m(1), m(2)];
  const first = openedSmartListRow({ listId: 'l', userId: 'u', items, row: null });
  assert.equal(splitNewMatches(items, first).freshKeys.size, 0);
});

test('seen keys keep the newest and stop at the cap', () => {
  const older = Array.from({ length: SMART_LIST_SEEN_CAP }, (_, i) => `movie:${i}`);
  const merged = mergeSeenKeys(['tv:1', 'movie:0'], older);
  assert.equal(merged.length, SMART_LIST_SEEN_CAP);
  assert.deepEqual(merged.slice(0, 3), ['tv:1', 'movie:0', 'movie:1']);
});

test('the index counts the roll-up’s finds per list', () => {
  assert.deepEqual(smartListNewCounts([
    { list_id: 'a', pending_keys: ['movie:1', 'movie:2'] },
    { list_id: 'b', pending_keys: [] },
  ]), { a: 2 });
});

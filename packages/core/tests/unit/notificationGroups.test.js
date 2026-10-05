import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNotifications, notificationKind, rollupNames, daysAgo, isTitleNotification } from '../../notificationGroups.js';

const now = Date.parse('2026-09-17T10:00:00');
const at = (h) => new Date(now - h * 3600 * 1000).toISOString();
const row = (id, type, hoursAgo, extra = {}) => ({ id, type, created_at: at(hoursAgo), read_at: null, actor_display_name: `P${id}`, ...extra });

test('requests leave the stream, recent followers roll up, the rest bucket by day', () => {
  const list = [row(1, 'follow_request', 1), row(2, 'new_follower', 2), row(3, 'new_follower', 30), row(4, 'follow_accepted', 3), row(5, 'post_like', 26), row(6, 'new_follower', 24 * 9)];
  const { rollup, groups } = groupNotifications(list, now);
  assert.deepEqual(rollup.items.map(n => n.id), [2, 3]);
  assert.deepEqual(groups.map(g => [g.key, g.items.map(n => n.id)]), [['today', [4]], ['yesterday', [5]], ['earlier', [6]]]);
});

test('a single new follower is not rolled up', () => {
  const { rollup, groups } = groupNotifications([row(1, 'new_follower', 2)], now);
  assert.equal(rollup, null);
  assert.equal(groups[0].items.length, 1);
});

test('kinds, names and day distance', () => {
  assert.deepEqual(['follow_request', 'new_follower', 'follow_accepted', 'post_like'].map(notificationKind), ['request', 'follow', 'follow', 'activity']);
  assert.deepEqual(rollupNames([row(1, 'x', 0), row(2, 'x', 0)], n => `${n} others`), { names: ['P1'], tail: 'P2' });
  assert.deepEqual(rollupNames([1, 2, 3, 4, 5].map(i => row(i, 'x', 0)), n => `${n} others`), { names: ['P1', 'P2', 'P3'], tail: '2 others' });
  assert.equal(daysAgo(at(1), now), 0);
  assert.equal(daysAgo(at(26), now), 1);
});

test('new_episode rows are title rows with their own kind, and bucket by day like the rest', () => {
  const ep = row(7, 'new_episode', 1, { actor_display_name: null, tmdb_id: 0, media_type: 'tv', season_number: 5, episode_number: 1 });
  assert.equal(notificationKind('new_episode'), 'episode');
  assert.equal(isTitleNotification(ep), true);
  assert.equal(isTitleNotification(row(8, 'new_follower', 1)), false);
  assert.equal(isTitleNotification({ ...ep, tmdb_id: null }), false);
  const { rollup, groups } = groupNotifications([ep, row(9, 'new_follower', 2)], now);
  assert.equal(rollup, null);
  assert.deepEqual(groups.map(g => [g.key, g.items.map(n => n.id)]), [['today', [7, 9]]]);
});

test('movie_release rows are title rows that wear the same kind as new_episode', () => {
  const movie = row(10, 'movie_release', 1, { actor_display_name: null, tmdb_id: 0, media_type: 'movie', release_kind: 'theatrical' });
  assert.equal(notificationKind('movie_release'), 'episode');
  assert.equal(isTitleNotification(movie), true);
  assert.equal(isTitleNotification({ ...movie, tmdb_id: null }), false);
  const { rollup, groups } = groupNotifications([movie, row(11, 'new_follower', 2)], now);
  assert.equal(rollup, null);
  assert.deepEqual(groups.map(g => [g.key, g.items.map(n => n.id)]), [['today', [10, 11]]]);
});

test('streaming_arrival rows are title rows, with the same kind and day bucketing as movie_release', () => {
  const arrival = row(12, 'streaming_arrival', 1, { actor_display_name: null, tmdb_id: 0, media_type: 'movie', release_kind: 'streaming', provider_name: 'Service A' });
  assert.equal(notificationKind('streaming_arrival'), 'episode');
  assert.equal(isTitleNotification(arrival), true);
  assert.equal(isTitleNotification({ ...arrival, tmdb_id: null }), false);
  const { rollup, groups } = groupNotifications([arrival, row(13, 'new_follower', 2)], now);
  assert.equal(rollup, null);
  assert.deepEqual(groups.map(g => [g.key, g.items.map(n => n.id)]), [['today', [12, 13]]]);
});

test('watch together requests leave the stream; accepted ones stay', () => {
  const { groups } = groupNotifications([row(1, 'watch_together_request', 1), row(2, 'watch_together_accepted', 2)], now);
  assert.deepEqual(groups.map(g => g.items.map(n => n.id)), [[2]]);
  assert.equal(notificationKind('watch_together_request'), 'request');
});

test('the smart lists roll-up is read from its payload, and a malformed one is ignored', async () => {
  const { smartListDigest } = await import('../../notificationGroups.js');
  const row = {
    id: 'n1', type: 'smart_list_digest', created_at: '2026-10-04T21:00:00Z',
    smart_list_digest: { count: 5, lists: [{ id: 'a', name: 'New films worth it', count: 3 }, { id: 'b', name: 'Short thrillers', count: 2 }, { id: 'c' }], posters: ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg'] },
  };
  assert.deepEqual(smartListDigest(row), {
    count: 5,
    lists: [{ id: 'a', name: 'New films worth it', count: 3 }, { id: 'b', name: 'Short thrillers', count: 2 }],
    posters: ['/a.jpg', '/b.jpg', '/c.jpg'],
  });
  assert.equal(smartListDigest({ ...row, smart_list_digest: { count: 0 } }), null);
  assert.equal(smartListDigest({ ...row, type: 'new_follower' }), null);
});

test('the roll-up reads as one sentence and names its lists', async () => {
  const { SMART_LIST_DIGEST } = await import('../../copy/notifications.js');
  assert.equal(SMART_LIST_DIGEST.title(5), 'Your smart lists found 5 new titles this week.');
  assert.equal(SMART_LIST_DIGEST.title(1), 'Your smart lists found 1 new title this week.');
  assert.equal(SMART_LIST_DIGEST.lists([{ name: 'A', count: 3 }, { name: 'B', count: 2 }]), 'A (3), B (2)');
});

test('the smart lists upgrade sheet says the rules are kept only when they were', async () => {
  const { upgradeSheetContent } = await import('../../upgradeSheet.js');
  assert.equal(upgradeSheetContent('smartLists').kept, null);
  assert.equal(upgradeSheetContent('smartLists', { kept: true }).kept, 'Your rules are kept. Upgrade and the list is ready.');
  assert.equal(upgradeSheetContent('lists', { kept: true }).kept, null);
});

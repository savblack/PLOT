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

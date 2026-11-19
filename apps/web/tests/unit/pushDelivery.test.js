import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupPushes, inQuietHours, localHour, pushAction, pushBlocked, pushMessage, pushMessageFor,
} from '../../../../supabase/functions/_shared/pushDelivery.js';

test('push needs current Premium, an opt-in before the row, and the streaming switch', () => {
  const prefs = { push_enabled: true, push_enabled_at: '2026-10-12T10:00:00Z', streaming_alerts: true };
  const row = { type: 'new_episode', created_at: '2026-10-12T10:01:00Z' };
  assert.equal(pushBlocked(prefs, row, true), null);
  assert.equal(pushBlocked(prefs, row, false), 'not_enabled');
  assert.equal(pushBlocked(prefs, { ...row, created_at: '2026-10-12T09:59:00Z' }, true), 'before_opt_in');
  assert.equal(pushBlocked({ ...prefs, streaming_alerts: false }, { ...row, type: 'streaming_arrival' }, true), 'streaming_off');
});

test('push ledger retries failures and stale claims, never a sent device', () => {
  const now = Date.parse('2026-10-12T10:30:00Z');
  assert.equal(pushAction(null, now), 'claim');
  assert.equal(pushAction({ status: 'sent', attempts: 1, claimed_at: null }, now), null);
  assert.equal(pushAction({ status: 'failed', attempts: 1, claimed_at: null }, now), 'retry');
  assert.equal(pushAction({ status: 'failed', attempts: 3, claimed_at: null }, now), null);
  assert.equal(pushAction({ status: 'pending', attempts: 1, claimed_at: '2026-10-12T10:29:00Z' }, now), null);
  assert.equal(pushAction({ status: 'pending', attempts: 1, claimed_at: '2026-10-12T10:00:00Z' }, now), 'reclaim');
});

test('push message carries a validated title target', () => {
  assert.deepEqual(pushMessage({
    id: 'n', user_id: 'u', type: 'new_episode', media_title: 'Severance', tmdb_id: 1, media_type: 'tv',
    season_number: 3, episode_number: 2, episode_count: 1, release_kind: null, provider_name: null,
  }), {
    title: 'Severance', body: 'S3 E2 is out', data: { notificationId: 'n', tmdbId: 1, mediaType: 'tv', userId: 'u' },
  });
});

test('the phone switch stops episode pushes only', () => {
  const prefs = { push_enabled: true, push_enabled_at: '2026-10-12T10:00:00Z', streaming_alerts: true, episode_push: false };
  const row = { type: 'new_episode', created_at: '2026-10-12T10:01:00Z' };
  assert.equal(pushBlocked(prefs, row, true), 'episode_push_off');
  assert.equal(pushBlocked(prefs, { ...row, type: 'streaming_arrival' }, true), null);
  // A row from before the column existed reads as on.
  assert.equal(pushBlocked({ ...prefs, episode_push: undefined }, row, true), null);
});

test('quiet hours run 11 PM to 7 AM in the person’s own zone', () => {
  const at = (iso) => Date.parse(iso);
  // 10:59 PM, 11:00 PM, 6:59 AM and 7:00 AM Eastern.
  assert.equal(inQuietHours(at('2026-11-20T03:59:00Z'), 'America/New_York'), false);
  assert.equal(inQuietHours(at('2026-11-20T04:00:00Z'), 'America/New_York'), true);
  assert.equal(inQuietHours(at('2026-11-20T11:59:00Z'), 'America/New_York'), true);
  assert.equal(inQuietHours(at('2026-11-20T12:00:00Z'), 'America/New_York'), false);
  // 6 AM in New York is 11 AM in London: quiet for one, not the other.
  assert.equal(inQuietHours(at('2026-11-20T11:00:00Z'), 'America/New_York'), true);
  assert.equal(inQuietHours(at('2026-11-20T11:00:00Z'), 'Europe/London'), false);
});

test('an unknown or bad time zone counts as Eastern, never UTC', () => {
  const t = Date.parse('2026-11-20T04:30:00Z'); // 11:30 PM Eastern, 4:30 AM UTC
  assert.equal(localHour(t, null), 23);
  assert.equal(localHour(t, 'Not/AZone'), 23);
});

const episode = (id, title) => ({ notification: { id, user_id: 'u', type: 'new_episode', media_title: title, tmdb_id: 1, media_type: 'tv', season_number: 1, episode_number: 2, episode_count: 1, release_kind: null, provider_name: null } });
const film = { notification: { id: 'f', user_id: 'u', type: 'movie_release', media_title: 'Film', tmdb_id: 2, media_type: 'movie', release_kind: 'digital' } };

test('at 7 AM, waiting episodes become one summary; films stay separate', () => {
  const seven = Date.parse('2026-11-20T12:05:00Z'); // 7:05 AM Eastern
  const groups = groupPushes([episode('a', 'A'), film, episode('b', 'B')], seven, 'America/New_York');
  assert.deepEqual(groups.map(g => g.map(c => c.notification.id)), [['a', 'b'], ['f']]);
});

test('during the day each episode is its own push, and a lone morning one too', () => {
  const noon = Date.parse('2026-11-20T17:00:00Z');
  assert.equal(groupPushes([episode('a', 'A'), episode('b', 'B')], noon, 'America/New_York').length, 2);
  const seven = Date.parse('2026-11-20T12:05:00Z');
  assert.equal(groupPushes([episode('a', 'A')], seven, 'America/New_York').length, 1);
});

test('the summary names up to three shows and opens the first', () => {
  const msg = pushMessageFor(['A', 'B', 'C', 'D', 'D'].map((t, i) => episode(String(i), t).notification));
  assert.equal(msg.title, '5 new episodes dropped overnight');
  assert.equal(msg.body, 'A, B, C and 1 more');
  assert.equal(msg.data.notificationId, '0');
  assert.equal(pushMessageFor([episode('a', 'A').notification, episode('b', 'B').notification]).body, 'A and B');
  assert.deepEqual(pushMessageFor([episode('a', 'A').notification]), pushMessage(episode('a', 'A').notification));
});

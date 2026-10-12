import test from 'node:test';
import assert from 'node:assert/strict';
import { pushAction, pushBlocked, pushMessage } from '../../../../supabase/functions/_shared/pushDelivery.js';

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

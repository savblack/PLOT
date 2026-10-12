import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
import { enableStreamingArrivalAlert, showStreamingArrivalAsk } from '../../useStreamingAlerts.js';

test('the prompt is only for a film with no offer in the region', () => {
  assert.equal(showStreamingArrivalAsk('movie', false), true);
  // Cinemas, rent, buy, and subscription all count as an offer at the call site.
  assert.equal(showStreamingArrivalAsk('movie', true), false);
  assert.equal(showStreamingArrivalAsk('tv', false), false);
  assert.equal(showStreamingArrivalAsk('tv', true), false);
  assert.equal(showStreamingArrivalAsk(undefined, false), false);
});

function clientWith(tables) {
  return createInMemorySupabase({
    tables,
    unique: { notification_preferences: ['user_id'] },
  });
}

test('enabling clears this film’s mute and turns the watchlist switch on', async () => {
  const client = clientWith({
    movie_streaming_alert_mutes: [
      { user_id: 'u1', tmdb_id: 11, title: 'Harbour Lights' },
      { user_id: 'u1', tmdb_id: 22, title: 'Other Film' },
    ],
    notification_preferences: [
      { user_id: 'u1', streaming_alerts: false, streaming_email: true },
    ],
  });
  configure({ supabaseClient: client });

  const result = await enableStreamingArrivalAlert('u1', { id: 11, title: 'Harbour Lights' });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    client.__db.tables.movie_streaming_alert_mutes.map(row => row.tmdb_id),
    [22],
  );
  assert.equal(client.__db.tables.notification_preferences[0].streaming_alerts, true);
  assert.equal(client.__db.tables.notification_preferences[0].streaming_email, true);
});

test('enabling creates a preferences row when the account has none', async () => {
  const client = clientWith({ movie_streaming_alert_mutes: [], notification_preferences: [] });
  configure({ supabaseClient: client });

  const result = await enableStreamingArrivalAlert('u1', { id: 11, title: 'Harbour Lights' });

  assert.equal(result.ok, true);
  assert.equal(client.__db.tables.notification_preferences.length, 1);
  assert.equal(client.__db.tables.notification_preferences[0].streaming_alerts, true);
  assert.equal(client.__db.tables.notification_preferences[0].user_id, 'u1');
});

test('a failed mute clear does not touch the watchlist switch', async () => {
  const client = clientWith({
    movie_streaming_alert_mutes: [{ user_id: 'u1', tmdb_id: 11, title: 'Harbour Lights' }],
    notification_preferences: [{ user_id: 'u1', streaming_alerts: false, streaming_email: false }],
  });
  client.failNext('movie_streaming_alert_mutes', 'delete', { message: 'nope' });
  configure({ supabaseClient: client });

  const result = await enableStreamingArrivalAlert('u1', { id: 11, title: 'Harbour Lights' });

  assert.equal(result.ok, false);
  assert.equal(client.__db.tables.movie_streaming_alert_mutes.length, 1);
  assert.equal(client.__db.tables.notification_preferences[0].streaming_alerts, false);
});

test('a film without a TMDB title is refused before any write', async () => {
  const client = clientWith({
    movie_streaming_alert_mutes: [{ user_id: 'u1', tmdb_id: 11, title: 'Harbour Lights' }],
    notification_preferences: [],
  });
  configure({ supabaseClient: client });

  assert.deepEqual(await enableStreamingArrivalAlert('u1', { id: 11, title: '  ' }), { ok: false });
  assert.deepEqual(await enableStreamingArrivalAlert('u1', { id: 0, title: 'Harbour Lights' }), { ok: false });
  assert.deepEqual(await enableStreamingArrivalAlert(null, { id: 11, title: 'Harbour Lights' }), { ok: false });
  assert.equal(client.__db.tables.movie_streaming_alert_mutes.length, 1);
  assert.equal(client.__db.tables.notification_preferences.length, 0);
});

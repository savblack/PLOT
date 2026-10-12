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

test('enabling reports streaming_alert_set and still succeeds when that call fails', async () => {
  const client = createInMemorySupabase({
    tables: {
      movie_streaming_alert_mutes: [{ user_id: 'u1', tmdb_id: 11, title: 'Harbour Lights' }],
      notification_preferences: [],
    },
    unique: { notification_preferences: ['user_id'] },
    session: { access_token: 'tok' },
  });
  configure({ supabaseClient: client, supabaseUrl: 'https://proj.supabase.co' });
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      auth: init.headers.Authorization,
      body: JSON.parse(init.body),
    });
    return new Response('no', { status: 503 });
  };
  try {
    const result = await enableStreamingArrivalAlert('u1', { id: 11, title: 'Harbour Lights' });
    assert.equal(result.ok, true);
    assert.equal(client.__db.tables.movie_streaming_alert_mutes.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://proj.supabase.co/functions/v1/alert-brevo-event');
    assert.equal(calls[0].auth, 'Bearer tok');
    assert.deepEqual(calls[0].body, {
      event: 'streaming_alert_set',
      title: 'Harbour Lights',
      title_id: 11,
      media_type: 'movie',
    });
  } finally {
    globalThis.fetch = original;
  }
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

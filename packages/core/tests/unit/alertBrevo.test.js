import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
import { EPISODE_ALERT_SET, reportBrevoAlertSet } from '../../alertBrevo.js';

test('an episode alert reports episode_alert_set for a show', async () => {
  const client = createInMemorySupabase({ session: { access_token: 'tok' } });
  configure({ supabaseClient: client, supabaseUrl: 'https://proj.supabase.co' });
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await reportBrevoAlertSet({
      event: EPISODE_ALERT_SET,
      title: '  North  ',
      titleId: 42,
      mediaType: 'tv',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://proj.supabase.co/functions/v1/alert-brevo-event');
    assert.deepEqual(calls[0].body, {
      event: 'episode_alert_set',
      title: 'North',
      title_id: 42,
      media_type: 'tv',
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('a blank title or the wrong type does not call Brevo', async () => {
  const client = createInMemorySupabase({ session: { access_token: 'tok' } });
  configure({ supabaseClient: client, supabaseUrl: 'https://proj.supabase.co' });
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };
  try {
    await reportBrevoAlertSet({ event: EPISODE_ALERT_SET, title: '  ', titleId: 42, mediaType: 'tv' });
    await reportBrevoAlertSet({ event: EPISODE_ALERT_SET, title: 'North', titleId: 42, mediaType: 'movie' });
    await reportBrevoAlertSet({ event: 'streaming_alert_set', title: 'North', titleId: 42, mediaType: 'tv' });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

import { assertEquals } from 'jsr:@std/assert@1';
import {
  EPISODE_ALERT_SET,
  STREAMING_ALERT_SET,
  parseAlertEvent,
  postAlertBrevoEvent,
  rateLimitHit,
} from './alertBrevoEvent.ts';

function mockFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (input, init) => Promise.resolve(handler(String(input), init));
}

Deno.test('the streaming prompt event carries the canonical film link', () => {
  const parsed = parseAlertEvent({
    event: STREAMING_ALERT_SET,
    title: '  Harbour Lights  ',
    title_id: 11,
    media_type: 'movie',
    title_url: 'https://evil.example/phish',
  });
  assertEquals(parsed, {
    ok: true,
    eventName: 'streaming_alert_set',
    properties: {
      title: 'Harbour Lights',
      title_id: 11,
      media_type: 'movie',
      title_url: 'https://app.theplot.tv/save?media_type=movie&tmdb_id=11',
    },
  });
});

Deno.test('the episode toast event carries the canonical show link', () => {
  const parsed = parseAlertEvent({
    event: EPISODE_ALERT_SET,
    title: 'North',
    title_id: '42',
    media_type: 'tv',
  });
  assertEquals(parsed, {
    ok: true,
    eventName: 'episode_alert_set',
    properties: {
      title: 'North',
      title_id: 42,
      media_type: 'tv',
      title_url: 'https://app.theplot.tv/save?media_type=tv&tmdb_id=42',
    },
  });
});

Deno.test('a mismatched type or a blank title is refused', () => {
  assertEquals(parseAlertEvent({ event: STREAMING_ALERT_SET, title: 'North', title_id: 1, media_type: 'tv' }).ok, false);
  assertEquals(parseAlertEvent({ event: EPISODE_ALERT_SET, title: 'North', title_id: 1, media_type: 'movie' }).ok, false);
  assertEquals(parseAlertEvent({ event: 'other', title: 'North', title_id: 1, media_type: 'tv' }).ok, false);
  assertEquals(parseAlertEvent({ event: EPISODE_ALERT_SET, title: '  ', title_id: 1, media_type: 'tv' }).ok, false);
  assertEquals(parseAlertEvent({ event: STREAMING_ALERT_SET, title: 'North', title_id: 0, media_type: 'movie' }).ok, false);
});

Deno.test('the Brevo event post uses the event name and the four properties', async () => {
  let sent: unknown = null;
  const fetchImpl = mockFetch((url, init) => {
    assertEquals(url, 'https://api.brevo.com/v3/events');
    assertEquals(new Headers(init?.headers).get('api-key'), 'key');
    sent = JSON.parse(String(init?.body));
    return new Response(null, { status: 204 });
  });
  const parsed = parseAlertEvent({
    event: STREAMING_ALERT_SET,
    title: 'Harbour Lights',
    title_id: 11,
    media_type: 'movie',
  });
  if (!parsed.ok) throw new Error('expected a parsed event');
  const result = await postAlertBrevoEvent({
    fetchImpl,
    apiKey: 'key',
    email: 'reader@example.com',
    eventName: parsed.eventName,
    properties: parsed.properties,
  });
  assertEquals(result, { ok: true });
  assertEquals(sent, {
    event_name: 'streaming_alert_set',
    identifiers: { email_id: 'reader@example.com' },
    event_properties: {
      title: 'Harbour Lights',
      title_id: 11,
      media_type: 'movie',
      title_url: 'https://app.theplot.tv/save?media_type=movie&tmdb_id=11',
    },
  });
});

Deno.test('a rejected Brevo event stays a failure for the caller', async () => {
  const fetchImpl = mockFetch(() => new Response('no', { status: 400 }));
  const result = await postAlertBrevoEvent({
    fetchImpl,
    apiKey: 'key',
    email: 'reader@example.com',
    eventName: EPISODE_ALERT_SET,
    properties: {
      title: 'North',
      title_id: 42,
      media_type: 'tv',
      title_url: 'https://app.theplot.tv/save?media_type=tv&tmdb_id=42',
    },
  });
  assertEquals(result, { ok: false });
});

Deno.test('the per-user cap counts past the window and then resets', () => {
  const store = new Map();
  assertEquals(rateLimitHit(store, 'user-1', 0, 1000, 2), false);
  assertEquals(rateLimitHit(store, 'user-1', 10, 1000, 2), false);
  assertEquals(rateLimitHit(store, 'user-1', 20, 1000, 2), true);
  assertEquals(rateLimitHit(store, 'user-1', 2000, 1000, 2), false);
});

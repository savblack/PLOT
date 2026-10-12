import { assertEquals } from 'jsr:@std/assert@1';
import {
  decideWaitlistJoin,
  findWaitlistSegmentId,
  rateLimitHit,
  upsertPremiumWaitlistContact,
  WAITLIST_SEGMENT_NAME,
} from './premiumWaitlist.ts';

function mockFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (input, init) => Promise.resolve(handler(String(input), init));
}

Deno.test('a signed-in address wins, and a honeypot never joins', () => {
  assertEquals(
    decideWaitlistJoin({ website: 'https://spam.test', gate: 'themes', email: 'person@example.com' }).action,
    'pretend',
  );
  assertEquals(
    decideWaitlistJoin({ gate: 'themes', email: 'other@example.com', accountEmail: ' Reader@Example.com ' }),
    { action: 'join', email: 'reader@example.com', gate: 'themes' },
  );
  assertEquals(
    decideWaitlistJoin({ gate: 'smart_lists', email: ' Reader@Example.com ' }),
    { action: 'join', email: 'reader@example.com', gate: 'smart_lists' },
  );
  assertEquals(decideWaitlistJoin({ gate: 'lists', email: 'reader@example.com' }).action, 'reject');
  assertEquals(decideWaitlistJoin({ gate: 'themes', email: 'nope' }), { action: 'reject', error: 'invalid_email', status: 400 });
});

Deno.test('the segment lookup uses the exact Premium waitlist name', async () => {
  const fetchImpl = mockFetch((url) => {
    if (url.includes('after=')) {
      return Response.json({ data: [{ id: 'seg-2', name: WAITLIST_SEGMENT_NAME }], has_more: false });
    }
    return Response.json({ data: [{ id: 'seg-1', name: 'Early Users' }], has_more: true });
  });
  assertEquals(await findWaitlistSegmentId(fetchImpl, 'key'), 'seg-2');

  const missing = mockFetch(() => Response.json({ data: [{ id: 'seg-1', name: 'Early Users' }], has_more: false }));
  assertEquals(await findWaitlistSegmentId(missing, 'key'), null);
});

Deno.test('a new address is created on the segment with the gate', async () => {
  const bodies: unknown[] = [];
  const fetchImpl = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return new Response('missing', { status: 404 });
    bodies.push(JSON.parse(String(init?.body)));
    assertEquals(url, 'https://api.resend.com/contacts');
    return Response.json({ id: 'contact-1' });
  });
  const result = await upsertPremiumWaitlistContact({
    fetchImpl, apiKey: 'key', email: 'reader@example.com', gate: 'themes', segmentId: 'seg-1',
  });
  assertEquals(result, { ok: true, already: false });
  assertEquals(bodies[0], {
    email: 'reader@example.com',
    unsubscribed: false,
    properties: { premium_interest: 'themes' },
    segments: [{ id: 'seg-1' }],
  });
});

Deno.test('the same gate on an existing contact is already joined', async () => {
  let wrote = false;
  const fetchImpl = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') wrote = true;
    if (url.endsWith('/segments')) return Response.json({ data: [{ id: 'seg-1', name: 'Premium waitlist' }] });
    return Response.json({ properties: { premium_interest: { type: 'string', value: 'themes' } } });
  });
  const result = await upsertPremiumWaitlistContact({
    fetchImpl, apiKey: 'key', email: 'reader@example.com', gate: 'themes', segmentId: 'seg-1',
  });
  assertEquals(result, { ok: true, already: true });
  assertEquals(wrote, false);
});

Deno.test('a second gate updates the property and counts as a new join', async () => {
  let patched: unknown = null;
  const fetchImpl = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/segments')) return Response.json({ data: [{ id: 'seg-1', name: 'Premium waitlist' }] });
    if (method === 'PATCH') {
      patched = JSON.parse(String(init?.body));
      return Response.json({ id: 'contact-1' });
    }
    return Response.json({ properties: { premium_interest: { type: 'string', value: 'themes' } } });
  });
  const result = await upsertPremiumWaitlistContact({
    fetchImpl, apiKey: 'key', email: 'reader@example.com', gate: 'smart_lists', segmentId: 'seg-1',
  });
  assertEquals(result, { ok: true, already: false });
  assertEquals(patched, { properties: { premium_interest: 'smart_lists' } });
});

Deno.test('a missing property or a failed create stays unavailable', async () => {
  const createFails = mockFetch((_url, init) => {
    if ((init?.method ?? 'GET') === 'GET') return new Response('missing', { status: 404 });
    return new Response('unknown property', { status: 422 });
  });
  assertEquals(
    await upsertPremiumWaitlistContact({ fetchImpl: createFails, apiKey: 'key', email: 'reader@example.com', gate: 'themes', segmentId: 'seg-1' }),
    { ok: false, error: 'unavailable' },
  );

  const patchFails = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/segments')) return Response.json({ data: [{ id: 'seg-1' }] });
    if (method === 'PATCH') return new Response('unknown property', { status: 422 });
    return Response.json({ properties: {} });
  });
  assertEquals(
    await upsertPremiumWaitlistContact({ fetchImpl: patchFails, apiKey: 'key', email: 'reader@example.com', gate: 'themes', segmentId: 'seg-1' }),
    { ok: false, error: 'unavailable' },
  );
});

Deno.test('the per-ip cap counts past the window and then resets', () => {
  const store = new Map();
  assertEquals(rateLimitHit(store, '1.1.1.1', 0, 1000, 2), false);
  assertEquals(rateLimitHit(store, '1.1.1.1', 10, 1000, 2), false);
  assertEquals(rateLimitHit(store, '1.1.1.1', 20, 1000, 2), true);
  assertEquals(rateLimitHit(store, '1.1.1.1', 2000, 1000, 2), false);
});

import { assertEquals } from 'jsr:@std/assert@1';
import {
  decideWaitlistJoin,
  rateLimitHit,
  upsertPremiumWaitlistContact,
  WAITLIST_ATTRIBUTE,
} from './premiumWaitlist.ts';

const LIST_ID = 42;

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

Deno.test('a new address is created on the Premium waitlist with the gate', async () => {
  const bodies: unknown[] = [];
  const fetchImpl = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return new Response('missing', { status: 404 });
    bodies.push(JSON.parse(String(init?.body)));
    assertEquals(url, 'https://api.brevo.com/v3/contacts');
    assertEquals(new Headers(init?.headers).get('api-key'), 'key');
    return new Response(null, { status: 201 });
  });
  const result = await upsertPremiumWaitlistContact({
    fetchImpl, apiKey: 'key', email: 'reader@example.com', gate: 'themes', listId: LIST_ID,
  });
  assertEquals(result, { ok: true, already: false });
  assertEquals(bodies[0], {
    email: 'reader@example.com',
    attributes: { [WAITLIST_ATTRIBUTE]: 'themes' },
    listIds: [LIST_ID],
    updateEnabled: true,
  });
});

Deno.test('the same gate on a contact already in the list is already joined', async () => {
  let wrote = false;
  const fetchImpl = mockFetch((_url, init) => {
    if ((init?.method ?? 'GET') !== 'GET') wrote = true;
    return Response.json({
      email: 'reader@example.com',
      attributes: { [WAITLIST_ATTRIBUTE]: 'themes' },
      listIds: [LIST_ID],
    });
  });
  const result = await upsertPremiumWaitlistContact({
    fetchImpl, apiKey: 'key', email: 'reader@example.com', gate: 'themes', listId: LIST_ID,
  });
  assertEquals(result, { ok: true, already: true });
  assertEquals(wrote, false);
});

Deno.test('a second gate updates the attribute and counts as a new join', async () => {
  let posted: unknown = null;
  const fetchImpl = mockFetch((_url, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST') {
      posted = JSON.parse(String(init?.body));
      return new Response(null, { status: 204 });
    }
    return Response.json({
      attributes: { [WAITLIST_ATTRIBUTE]: 'themes' },
      listIds: [LIST_ID],
    });
  });
  const result = await upsertPremiumWaitlistContact({
    fetchImpl, apiKey: 'key', email: 'reader@example.com', gate: 'smart_lists', listId: LIST_ID,
  });
  assertEquals(result, { ok: true, already: false });
  assertEquals(posted, {
    email: 'reader@example.com',
    attributes: { [WAITLIST_ATTRIBUTE]: 'smart_lists' },
    listIds: [LIST_ID],
    updateEnabled: true,
  });
});

Deno.test('a contact with the attribute but not on the list is a new join', async () => {
  let posted = false;
  const fetchImpl = mockFetch((_url, init) => {
    if ((init?.method ?? 'GET') === 'POST') {
      posted = true;
      return new Response(null, { status: 204 });
    }
    return Response.json({
      attributes: { [WAITLIST_ATTRIBUTE]: 'themes' },
      listIds: [9],
    });
  });
  const result = await upsertPremiumWaitlistContact({
    fetchImpl, apiKey: 'key', email: 'reader@example.com', gate: 'themes', listId: LIST_ID,
  });
  assertEquals(result, { ok: true, already: false });
  assertEquals(posted, true);
});

Deno.test('a failed read or a failed upsert stays unavailable', async () => {
  const readFails = mockFetch(() => new Response('down', { status: 500 }));
  assertEquals(
    await upsertPremiumWaitlistContact({ fetchImpl: readFails, apiKey: 'key', email: 'reader@example.com', gate: 'themes', listId: LIST_ID }),
    { ok: false, error: 'unavailable' },
  );

  const writeFails = mockFetch((_url, init) => {
    if ((init?.method ?? 'GET') === 'GET') return new Response('missing', { status: 404 });
    return new Response('rejected', { status: 400 });
  });
  assertEquals(
    await upsertPremiumWaitlistContact({ fetchImpl: writeFails, apiKey: 'key', email: 'reader@example.com', gate: 'themes', listId: LIST_ID }),
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

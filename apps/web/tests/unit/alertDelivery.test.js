import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_LOOK_BACK_DAYS, MAX_ATTEMPTS, MAX_ITEMS_PER_EMAIL, PENDING_LEASE_MINUTES, UNSUBSCRIBE_CHANNEL,
  deliveryAction, emailBlocker, parseBatchResponse, planEmail, sendRunFailed, signUnsubscribeToken,
  unsubscribeUrl, verifyUnsubscribeToken,
} from '../../../../supabase/functions/_shared/alertDelivery.js';

// The rules behind Premium email alerts. The bar is that a duplicate or an
// unwanted email is worse than a late one, so most of these pin down what stays
// silent. Ids are fictional: they are not TMDB or user ids and are only keys.

const NOW = '2026-10-06T22:45:00.000Z';
const minutesAgo = (m) => new Date(Date.parse(NOW) - m * 60000).toISOString();
const daysAgo = (d) => new Date(Date.parse(NOW) - d * 86400000).toISOString();
const delivery = (over = {}) => ({ status: 'pending', attempts: 1, claimedAt: minutesAgo(1), ...over });

test('deliveryAction: no row means claim; sent and skipped are done', () => {
  assert.equal(deliveryAction(undefined, NOW), 'claim');
  assert.equal(deliveryAction(null, NOW), 'claim');
  assert.equal(deliveryAction(delivery({ status: 'sent' }), NOW), 'done');
  assert.equal(deliveryAction(delivery({ status: 'skipped' }), NOW), 'done');
});

test('deliveryAction: a sent alert is never sent again, however many attempts it took', () => {
  assert.equal(deliveryAction(delivery({ status: 'sent', attempts: MAX_ATTEMPTS }), NOW), 'done');
});

test('deliveryAction: a failed send is retried until attempts run out, then given up', () => {
  assert.equal(deliveryAction(delivery({ status: 'failed', attempts: 1 }), NOW), 'retry');
  assert.equal(deliveryAction(delivery({ status: 'failed', attempts: MAX_ATTEMPTS - 1 }), NOW), 'retry');
  assert.equal(deliveryAction(delivery({ status: 'failed', attempts: MAX_ATTEMPTS }), NOW), 'give_up');
  assert.equal(MAX_ATTEMPTS, 3);
});

test('deliveryAction: a pending row inside the lease belongs to a run still sending, so wait', () => {
  assert.equal(deliveryAction(delivery({ claimedAt: minutesAgo(PENDING_LEASE_MINUTES - 1) }), NOW), 'wait');
});

test('deliveryAction: a pending row past the lease was abandoned and may be retaken, within the attempt limit', () => {
  assert.equal(deliveryAction(delivery({ claimedAt: minutesAgo(PENDING_LEASE_MINUTES + 1) }), NOW), 'reclaim');
  assert.equal(deliveryAction(delivery({ claimedAt: minutesAgo(60), attempts: MAX_ATTEMPTS }), NOW), 'give_up');
  // An unreadable claim time never leaves an alert stuck forever.
  assert.equal(deliveryAction(delivery({ claimedAt: null }), NOW), 'reclaim');
  assert.equal(deliveryAction(delivery({ claimedAt: 'nope' }), NOW), 'reclaim');
});

test('emailBlocker: needs the preference on, the in-app switch on, and current Premium', () => {
  assert.equal(emailBlocker({ prefs: { streaming_email: true, streaming_alerts: true }, premium: true }), null);
  // No row, a false value and a missing column all mean no email.
  for (const prefs of [null, undefined, {}, { streaming_email: false }, { streaming_email: null }, { streaming_email: 'true' }]) {
    assert.equal(emailBlocker({ prefs, premium: true }), 'no_pref');
  }
  // The in-app switch having been turned off since stops the email too.
  assert.equal(emailBlocker({ prefs: { streaming_email: true, streaming_alerts: false }, premium: true }), 'alerts_off');
  // A lapsed member keeps their choice but gets nothing.
  assert.equal(emailBlocker({ prefs: { streaming_email: true, streaming_alerts: true }, premium: false }), 'not_premium');
  // A missing in-app value is "on" (no row means alert me), same as everywhere else.
  assert.equal(emailBlocker({ prefs: { streaming_email: true }, premium: true }), null);
});

const note = (id, over = {}) => ({ id, created_at: minutesAgo(30), ...over });

test('planEmail covers new alerts, oldest first, and leaves done, waiting and given-up ones out', () => {
  const deliveries = new Map([
    ['sent', delivery({ status: 'sent' })],
    ['busy', delivery()],
    ['dead', delivery({ status: 'failed', attempts: MAX_ATTEMPTS })],
    ['again', delivery({ status: 'failed', attempts: 1 })],
    ['stale', delivery({ claimedAt: minutesAgo(90) })],
  ]);
  const { selected, counts } = planEmail([
    note('newest', { created_at: minutesAgo(5) }), note('sent'), note('busy'), note('dead'),
    note('again', { created_at: minutesAgo(200) }), note('stale', { created_at: minutesAgo(100) }), note('oldest', { created_at: minutesAgo(900) }),
  ], deliveries, NOW);
  assert.deepEqual(selected.map(s => [s.notification.id, s.action]), [
    ['oldest', 'claim'], ['again', 'retry'], ['stale', 'reclaim'], ['newest', 'claim'],
  ]);
  assert.deepEqual(counts, { too_old: 0, done: 1, wait: 1, give_up: 1, deferred: 0 });
});

test('planEmail ignores alerts older than the look-back, so old news is never emailed', () => {
  const { selected, counts } = planEmail([note('old', { created_at: daysAgo(EMAIL_LOOK_BACK_DAYS + 1) }), note('fresh')], new Map(), NOW);
  assert.deepEqual(selected.map(s => s.notification.id), ['fresh']);
  assert.equal(counts.too_old, 1);
  assert.equal(EMAIL_LOOK_BACK_DAYS, 7);
});

test('planEmail caps one email and defers the rest, without claiming them', () => {
  const many = Array.from({ length: MAX_ITEMS_PER_EMAIL + 3 }, (_, i) => note(`n${i}`, { created_at: minutesAgo(1000 - i) }));
  const { selected, counts } = planEmail(many, new Map(), NOW);
  assert.equal(selected.length, MAX_ITEMS_PER_EMAIL);
  assert.equal(counts.deferred, 3);
  // The deferred ones are the newest, which is what the next run picks up.
  assert.deepEqual(selected.map(s => s.notification.id).slice(-1), [`n${MAX_ITEMS_PER_EMAIL - 1}`]);
});

test('planEmail does not mutate its inputs and handles nothing to do', () => {
  const input = [note('b', { created_at: minutesAgo(5) }), note('a', { created_at: minutesAgo(50) })];
  const copy = JSON.stringify(input);
  planEmail(input, new Map(), NOW);
  assert.equal(JSON.stringify(input), copy);
  assert.deepEqual(planEmail([], new Map(), NOW).selected, []);
});

test('parseBatchResponse only returns ids when the response lines up with what was sent (null means unknown ids, not a failed send)', () => {
  assert.deepEqual(parseBatchResponse({ data: [{ id: 'a' }, { id: 'b' }] }, 2), ['a', 'b']);
  // A short, long, malformed or id-less response gives no ids. The caller still records a 2xx as sent.
  for (const bad of [{ data: [{ id: 'a' }] }, { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { data: [{ id: 'a' }, {}] }, { data: [{ id: 'a' }, { id: '' }] }, { data: 'x' }, {}, null, undefined, []]) {
    assert.equal(parseBatchResponse(bad, 2), null);
  }
});

test('sendRunFailed needs a real sample before it judges a rate', () => {
  assert.equal(sendRunFailed({ attempted: 4, failed: 4 }), false);
  assert.equal(sendRunFailed({ attempted: 10, failed: 6 }), true);
  assert.equal(sendRunFailed({ attempted: 10, failed: 5 }), false);
  assert.equal(sendRunFailed({ attempted: 0, failed: 0 }), false);
});

const SECRET = 'a-test-secret-that-is-long-enough';
const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

test('an unsubscribe token round trips to the person and channel it was made for', async () => {
  const token = await signUnsubscribeToken(SECRET, USER);
  assert.deepEqual(await verifyUnsubscribeToken(SECRET, token), { userId: USER, channel: UNSUBSCRIBE_CHANNEL });
});

test('a token is rejected under a different secret, so rotating the secret kills old links', async () => {
  const token = await signUnsubscribeToken(SECRET, USER);
  assert.equal(await verifyUnsubscribeToken('another-secret-that-is-long-enough', token), null);
});

test('a token cannot be edited to name someone else, another channel, or a different signature', async () => {
  const token = await signUnsubscribeToken(SECRET, USER);
  const [, channel, signature] = token.split('.');
  assert.equal(await verifyUnsubscribeToken(SECRET, `${OTHER}.${channel}.${signature}`), null);
  assert.equal(await verifyUnsubscribeToken(SECRET, `${USER}.marketing_emails.${signature}`), null);
  assert.equal(await verifyUnsubscribeToken(SECRET, `${USER}.${channel}.${signature.slice(0, -2)}AA`), null);
  assert.equal(await verifyUnsubscribeToken(SECRET, `${USER}.${channel}.`), null);
});

test('anything that is not a token verifies to null rather than throwing', async () => {
  for (const junk of [undefined, null, 0, {}, '', 'x', 'a.b', 'a.b.c.d', `${USER}.${UNSUBSCRIBE_CHANNEL}`, 'x'.repeat(500), `not-a-uuid.${UNSUBSCRIBE_CHANNEL}.sig`]) {
    assert.equal(await verifyUnsubscribeToken(SECRET, junk), null);
  }
  // No usable secret verifies nothing, instead of accepting an empty-key signature.
  assert.equal(await verifyUnsubscribeToken('', await signUnsubscribeToken(SECRET, USER)), null);
  assert.equal(await verifyUnsubscribeToken(undefined, await signUnsubscribeToken(SECRET, USER)), null);
});

test('signing refuses a short secret, a bad user id and an unknown channel', async () => {
  await assert.rejects(() => signUnsubscribeToken('short', USER), /secret/);
  await assert.rejects(() => signUnsubscribeToken('', USER), /secret/);
  await assert.rejects(() => signUnsubscribeToken(SECRET, 'not-a-uuid'), /user id/);
  await assert.rejects(() => signUnsubscribeToken(SECRET, USER, 'marketing_emails'), /channel/);
});

test('an uppercase user id in a token comes back lowercase, so it matches the database', async () => {
  const upper = USER.replace(/[a-f]/g, c => c.toUpperCase());
  const token = await signUnsubscribeToken(SECRET, upper);
  assert.equal((await verifyUnsubscribeToken(SECRET, token)).userId, USER);
});

test('unsubscribeUrl points at the alert function, encodes the token and tolerates a trailing slash', () => {
  assert.equal(unsubscribeUrl('https://example.supabase.co/', 'a.b.c'), 'https://example.supabase.co/functions/v1/alert-email-unsubscribe?token=a.b.c');
  assert.equal(unsubscribeUrl('https://example.supabase.co', 'a b&c'), 'https://example.supabase.co/functions/v1/alert-email-unsubscribe?token=a%20b%26c');
});

// Rules for emailing streaming alerts (supabase/functions/alert-email-delivery
// and alert-email-unsubscribe).
//
// Pure functions, so the rules that decide whether someone is emailed, whether a
// send is retried, and whether an unsubscribe link is genuine are tested with
// node --test (apps/web/tests/unit/alertDelivery.test.js) without Deno, a
// database or Resend. The bar is the same as every other alert here: a duplicate
// or an unwanted email is worse than a late one, so anything these cannot
// establish means "send nothing this run".
//
// The in-app notification (type 'streaming_arrival') is the source of truth.
// notification_deliveries is the ledger of what was done about it by email:
// a row is claimed before anything is sent, so a re-run, a retry or a crash
// cannot send the same alert twice.

export const EMAIL_CHANNEL = 'email';

/** Only alerts this recent are emailed. Lets a failed run heal on later runs, then lets old news go. */
export const EMAIL_LOOK_BACK_DAYS = 7;
/** Sends per alert (the first try plus retries). */
export const MAX_ATTEMPTS = 3;
/** A claimed (pending) row older than this was abandoned by a run that died, and may be taken again. */
export const PENDING_LEASE_MINUTES = 15;
/** One email covers everything new for a person; more than this waits for the next run. */
export const MAX_ITEMS_PER_EMAIL = 10;
/** A ceiling on emails in one run (each is one person). */
export const MAX_EMAILS_PER_RUN = 500;
/** Failure share above which the run is reported as not ok. */
export const MAX_FAILURE_RATE = 0.5;
/** Below this many emails a failure rate is too noisy to judge. */
export const FAILURE_MIN_SAMPLE = 5;

const DAY_MS = 86400000;
const MINUTE_MS = 60000;

/**
 * @typedef {{ status: 'pending' | 'sent' | 'failed' | 'skipped', attempts: number, claimedAt: string | null }} Delivery
 * @typedef {'claim' | 'retry' | 'reclaim' | 'wait' | 'done' | 'give_up'} DeliveryAction
 */

/**
 * What to do about one notification given its delivery row (or none).
 *
 *   claim    no row: first send.
 *   retry    failed, and attempts remain.
 *   reclaim  pending past the lease (a run died mid-send), and attempts remain.
 *   wait     pending within the lease: another run is sending it right now.
 *   done     sent or deliberately skipped.
 *   give_up  failed or abandoned and out of attempts.
 *
 * @param {Delivery | null | undefined} delivery
 * @param {string} nowIso
 * @returns {DeliveryAction}
 */
export function deliveryAction(delivery, nowIso) {
  if (!delivery) return 'claim';
  if (delivery.status === 'sent' || delivery.status === 'skipped') return 'done';
  if (delivery.attempts >= MAX_ATTEMPTS) return 'give_up';
  if (delivery.status === 'failed') return 'retry';
  // pending: leased, or abandoned
  const claimed = delivery.claimedAt ? Date.parse(delivery.claimedAt) : NaN;
  // An unreadable claim time is treated as abandoned: better a retry than a stuck alert.
  if (Number.isNaN(claimed) || Date.parse(nowIso) - claimed > PENDING_LEASE_MINUTES * MINUTE_MS) return 'reclaim';
  return 'wait';
}

/**
 * Why a person is not emailed, or null if they may be. All three must hold at
 * send time: the preference can have been turned off, the in-app switch can
 * have been turned off since the alert was written, and Premium can have lapsed.
 *
 * @param {{ prefs: { streaming_email?: boolean | null, streaming_alerts?: boolean | null } | null | undefined, premium: boolean }} person
 * @returns {'no_pref' | 'alerts_off' | 'not_premium' | null}
 */
export function emailBlocker({ prefs, premium }) {
  if (!prefs || prefs.streaming_email !== true) return 'no_pref';
  if (prefs.streaming_alerts === false) return 'alerts_off';
  if (!premium) return 'not_premium';
  return null;
}

/**
 * The notifications one person's next email should cover, oldest first, capped.
 * Anything past the cap is left alone (no delivery row), so the next run picks
 * it up while it is still inside the look-back.
 *
 * @template {{ id: string, created_at: string }} N
 * @param {N[]} notifications this person's streaming_arrival notifications
 * @param {Map<string, Delivery>} deliveries by notification id
 * @param {string} nowIso
 * @param {number} [max]
 * @returns {{ selected: Array<{ notification: N, action: 'claim' | 'retry' | 'reclaim' }>, counts: { too_old: number, done: number, wait: number, give_up: number, deferred: number } }}
 */
export function planEmail(notifications, deliveries, nowIso, max = MAX_ITEMS_PER_EMAIL) {
  const counts = { too_old: 0, done: 0, wait: 0, give_up: 0, deferred: 0 };
  const now = Date.parse(nowIso);
  /** @type {Array<{ notification: N, action: 'claim' | 'retry' | 'reclaim' }>} */
  const ready = [];
  for (const notification of [...notifications].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    if (now - Date.parse(notification.created_at) > EMAIL_LOOK_BACK_DAYS * DAY_MS) { counts.too_old++; continue; }
    const action = deliveryAction(deliveries.get(notification.id), nowIso);
    if (action === 'done' || action === 'wait' || action === 'give_up') { counts[action]++; continue; }
    ready.push({ notification, action });
  }
  const selected = ready.slice(0, max);
  counts.deferred = ready.length - selected.length;
  return { selected, counts };
}

/**
 * The provider ids from a Resend batch response, in the order the messages were
 * sent, or null if the response does not line up with them.
 *
 * Null only means "the ids are unknown", NOT "the send failed". A 2xx from the
 * provider means the batch was accepted, so the alerts are recorded as sent
 * (without a provider_ref) and are never retried: a duplicate email is worse
 * than a missing reference. Only a non-2xx or a failed request is a failure.
 *
 * @param {any} body
 * @param {number} expected
 * @returns {string[] | null}
 */
export function parseBatchResponse(body, expected) {
  const data = body?.data;
  if (!Array.isArray(data) || data.length !== expected) return null;
  const ids = data.map(d => d?.id);
  return ids.every(id => typeof id === 'string' && id) ? ids : null;
}

/**
 * Whether the run should be reported as not ok: too many emails failed to send.
 * @param {{ attempted: number, failed: number }} stats
 */
export function sendRunFailed({ attempted, failed }) {
  return attempted >= FAILURE_MIN_SAMPLE && failed / attempted > MAX_FAILURE_RATE;
}

// ── Unsubscribe links ─────────────────────────────────────────────────────────
//
// A stateless token: the person, the channel, and an HMAC over both under a
// secret only the Edge Functions hold. Nothing to store, nothing to enumerate,
// and a guessed or edited token fails. It is deliberately NOT the digest's
// marketing_subscribers.unsubscribe_token: alert email and the weekly digest are
// two consents, and a link for one must never change the other.

/** The one channel a token can name today. */
export const UNSUBSCRIBE_CHANNEL = 'streaming_email';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_SECRET_LENGTH = 16;
const encoder = new TextEncoder();

/** @param {Uint8Array} bytes */
function base64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} secret @param {string} message */
async function sign(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))));
}

/** Compares in time that does not depend on where the first difference is. @param {string} a @param {string} b */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * @param {string} secret ALERT_EMAIL_UNSUBSCRIBE_SECRET
 * @param {string} userId
 * @param {string} [channel]
 * @returns {Promise<string>}
 */
export async function signUnsubscribeToken(secret, userId, channel = UNSUBSCRIBE_CHANNEL) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) throw new Error('unsubscribe secret is missing or too short');
  if (!UUID.test(userId)) throw new Error('unsubscribe token needs a user id');
  if (channel !== UNSUBSCRIBE_CHANNEL) throw new Error('unknown channel');
  return `${userId}.${channel}.${await sign(secret, `${userId}.${channel}`)}`;
}

/**
 * @param {string} secret
 * @param {unknown} token
 * @returns {Promise<{ userId: string, channel: string } | null>} null for anything that is not a token we signed
 */
export async function verifyUnsubscribeToken(secret, token) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH || typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, channel, signature] = parts;
  if (!UUID.test(userId) || channel !== UNSUBSCRIBE_CHANNEL) return null;
  const expected = await sign(secret, `${userId}.${channel}`);
  return constantTimeEqual(expected, signature) ? { userId: userId.toLowerCase(), channel } : null;
}

/**
 * The link in the email. Points at the alert-email-unsubscribe Edge Function.
 * @param {string} supabaseUrl SUPABASE_URL
 * @param {string} token
 */
export const unsubscribeUrl = (supabaseUrl, token) =>
  `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/alert-email-unsubscribe?token=${encodeURIComponent(token)}`;

/**
 * kofi-webhook
 *
 * Receives Ko-fi payment notifications for ko-fi.com/J7P123TYGK and records
 * them in kofi_supporters, flipping profiles.is_supporter when the donor's
 * email matches a PLOT account.
 *
 * Recognition only. A Ko-fi tip grants no entitlement — that stays Stripe's
 * job (billing_customers / is_premium). Nothing here touches billing.
 *
 * Ko-fi posts application/x-www-form-urlencoded with a single `data` field
 * holding a JSON string. There is no signature: authentication is the
 * verification_token inside the payload, which Ko-fi shows on
 * ko-fi.com/manage/webhooks. Because it travels in the body, treat it as a
 * bearer secret — compare in constant time and never log the payload.
 *
 * Every newly-recorded tip (not a replay) also fires a `support_converted`
 * PostHog event — PLOT's second paid-conversion type alongside
 * `premium_converted` (see packages/core/analyticsEvents.js). Ko-fi hosts its
 * own checkout, so there's no client-side redirect-back to hook the way
 * Premium does; this calls PostHog's HTTP capture API directly instead of
 * posthog-js. Only non-PII fields (amount, currency, Ko-fi's own `type`) are
 * sent — never the donor's email, name or message.
 *
 * Deploy with verify_jwt = false (see supabase/config.toml) — Ko-fi sends no
 * Supabase JWT, so the gateway would otherwise 401 every delivery.
 *
 * Secrets: KOFI_VERIFICATION_TOKEN.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Same PostHog project token hardcoded elsewhere in this repo (e.g.
// supabase/functions/marketing-feed/index.ts) — it's a public write-only
// token, not a secret.
const POSTHOG_TOKEN = 'phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U';

// Fires the support_converted paid-conversion event for a newly-recorded tip.
// Best-effort: a PostHog outage must never fail the webhook ack Ko-fi is
// waiting on. Fields are whitelisted rather than forwarding the payload, so a
// donor's email/name/message can never end up in PostHog even by accident.
async function captureSupportConversion(payload: Record<string, unknown>, userId: string | null, txn: string) {
  try {
    await fetch('https://us.i.posthog.com/i/v0/e/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_TOKEN,
        event: 'support_converted',
        properties: {
          distinct_id: userId ?? `kofi:${txn}`,
          channel: 'kofi',
          matched: userId !== null,
          amount: typeof payload.amount === 'string' ? Number(payload.amount) : null,
          currency: typeof payload.currency === 'string' ? payload.currency : null,
          kofi_type: typeof payload.type === 'string' ? payload.type : null,
          is_first_subscription_payment: payload.is_first_subscription_payment === true,
        },
        timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : undefined,
      }),
    });
  } catch (err) {
    // Analytics must never break the webhook ack. Log the transaction id
    // only, matching the rest of this file's logging discipline.
    console.error(`kofi-webhook: PostHog capture failed for ${txn}: ${(err as Error).message}`);
  }
}

// Length-independent equality. Hashing both sides first means the comparison
// runs over fixed-width digests, so neither length nor content leaks by timing.
async function safeEqual(a: string, b: string) {
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('KOFI_VERIFICATION_TOKEN');
  if (!expected) {
    console.error('KOFI_VERIFICATION_TOKEN is not set — refusing all deliveries');
    return json({ error: 'Not configured' }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    const form = await req.formData();
    const raw = form.get('data');
    if (typeof raw !== 'string') return json({ error: 'Missing data field' }, 400);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Malformed payload' }, 400);
  }

  const token = typeof payload.verification_token === 'string' ? payload.verification_token : '';
  if (!(await safeEqual(token, expected))) {
    // No detail in the response and no payload in the log — an attacker who
    // guesses the endpoint URL learns nothing beyond "rejected".
    console.warn('kofi-webhook: bad verification token');
    return json({ error: 'Unauthorized' }, 401);
  }

  // The token is authentication, not data. Drop it before it can reach the DB
  // or a log line.
  delete payload.verification_token;

  const txn = typeof payload.kofi_transaction_id === 'string' ? payload.kofi_transaction_id : '';
  if (!txn) return json({ error: 'Missing kofi_transaction_id' }, 400);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // One RPC: the insert, the email -> user match and the badge flip are a
  // single statement, and it's idempotent on kofi_transaction_id. Ko-fi retries
  // deliveries, and its test button replays the same fake transaction id.
  const { data, error } = await db.rpc('record_kofi_tip', { p_payload: payload });

  if (error) {
    // 500 makes Ko-fi retry. Log the transaction id only — never the donor's
    // email, name or message.
    console.error(`kofi-webhook: record_kofi_tip failed for ${txn}: ${error.message}`);
    return json({ error: 'Failed to record tip' }, 500);
  }

  const result = (data ?? {}) as {
    recorded?: boolean;
    duplicate?: boolean;
    matched?: boolean;
    user_id?: string | null;
  };
  console.log(
    `kofi-webhook: ${txn} recorded=${!!result.recorded} duplicate=${!!result.duplicate} matched=${!!result.matched}`,
  );

  // Only a genuinely new tip is a new conversion — never double-count a
  // replayed delivery (Ko-fi retries, and its test button resends the same
  // fake transaction id).
  if (result.recorded) {
    await captureSupportConversion(payload, result.user_id ?? null, txn);
  }

  // Always 200 once stored: an unmatched tip is an expected outcome, not a
  // failure, and returning non-2xx would make Ko-fi retry it forever.
  return json({ ok: true, matched: !!result.matched });
});

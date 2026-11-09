/**
 * Premium checkout, shared by web and the phone app. Plot never takes a payment
 * itself: the stripe-billing edge function returns a Stripe-hosted URL for the
 * signed-in user, and each app sends the person there (web navigates, the phone
 * opens the browser).
 */
import { EVENTS } from './analyticsEvents.js';
import { supabase } from './supabase.js';
import { edgeFunctionUrl } from './functions.js';

export const CHECKOUT_PLANS = ['monthly', 'yearly'];

/** Anything other than a known plan falls back to monthly, the price the upgrade sheet shows. */
export function checkoutPlan(plan) {
  return CHECKOUT_PLANS.includes(plan) ? plan : 'monthly';
}

/** Web only: where a signed-out visitor goes to make an account; the chosen plan survives sign-up. */
export function signupPathForPlan(plan) {
  return `/signup?intent=premium&plan=${checkoutPlan(plan)}`;
}

/** Mailto for the closed-checkout waitlist. No payment, no new account store. */
export function waitlistMailto(subject) {
  return `mailto:support@theplot.tv?subject=${encodeURIComponent(subject)}`;
}

/**
 * 409 keeps the server's own sentence (checkout is already being prepared).
 * `premium_coming_soon` is the closed state, not a glitch to retry.
 * Other 503s are "not available right now" (price config, billing account).
 * Anything else uses the generic retry line.
 *
 * @param {number | undefined} status
 * @param {string | undefined} serverMessage
 * @param {string} fallback
 * @param {{ code?: string, closed?: string, unavailable?: string }} [extra]
 */
export function checkoutErrorMessage(status, serverMessage, fallback, extra = {}) {
  if (extra.code === 'premium_coming_soon') return extra.closed || fallback;
  if (status === 409 && serverMessage) return serverMessage;
  if (status === 503 && extra.unavailable) return extra.unavailable;
  return fallback;
}

/**
 * Ask stripe-billing for a Stripe URL on behalf of the signed-in user.
 * `checkout` takes `{ plan }`, `portal` takes nothing, `tip` takes `{ amount }`.
 * Rejects with an Error carrying `status` and the server's `code`
 * (`premium_coming_soon` is the closed state, not a glitch to retry).
 *
 * @param {'checkout' | 'portal' | 'tip'} action
 * @param {Record<string, unknown>} [body]
 * @param {{ client?: typeof supabase, fetchImpl?: typeof fetch, url?: string | null }} [options]
 * @returns {Promise<string>}
 */
export async function requestBillingUrl(action, body = {}, options = {}) {
  const client = options.client ?? supabase;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const { data: { session } } = await client.auth.getSession();
  const url = options.url ?? edgeFunctionUrl('stripe-billing', { action });
  if (!session || !url) throw new Error('Not signed in');
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw Object.assign(new Error(data?.error || 'Billing request failed'), { status: res.status, code: data?.code });
  }
  return data.url;
}

/**
 * Open a prepared checkout through the platform's navigation API.
 * Reports only a session ID from Stripe's URL path, never its URL or fragment.
 * @param {string} plan
 * @param {{ request: typeof requestBillingUrl, navigate: (url: string) => void | Promise<void>, track: (event: string, props: Record<string, unknown>) => void }} options
 */
export async function redirectToCheckout(plan, { request, navigate, track }) {
  const props = { plan: checkoutPlan(plan) };
  let stage = 'request';
  const capture = (event, properties) => {
    try { track(event, properties); } catch { /* Analytics must not block checkout. */ }
  };
  try {
    const url = await request('checkout', { plan: props.plan });
    const parsed = new URL(url);
    const sessionId = parsed.hostname === 'checkout.stripe.com'
      ? parsed.pathname.match(/\/(cs_(?:live|test)_[A-Za-z0-9]+)(?:\/|$)/)?.[1]
      : undefined;
    if (sessionId) props.checkout_session_id = sessionId;
    stage = 'redirect';
    capture(EVENTS.PREMIUM_CHECKOUT_REDIRECT_ATTEMPTED, props);
    await navigate(url);
  } catch (error) {
    if (error?.code !== 'premium_coming_soon' && error?.status !== 409) {
      capture(EVENTS.PREMIUM_CHECKOUT_BROWSER_FAILED, {
        ...props,
        stage,
        error_kind: stage === 'redirect' ? 'navigation_error' : 'billing_request_error',
        ...(Number.isInteger(error?.status) ? { http_status: error.status } : {}),
      });
    }
    throw error;
  }
}

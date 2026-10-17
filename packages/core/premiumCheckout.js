/* Starting Plot Premium checkout, shared by web and mobile.
 *
 * Both apps do the same thing: ask the stripe-billing edge function for a
 * Stripe Checkout URL for the signed-in viewer, then send the person there
 * (web navigates the page, mobile opens the browser). What differs is only
 * how the URL is opened and what is shown around it, so this holds the parts
 * that must not drift: which plans exist, how an error is worded, the closed
 * checkout state, and the request itself.
 *
 * The server is the authority. billing-availability says whether checkout is
 * open; stripe-billing re-checks and answers `premium_coming_soon` when it is
 * not, which is the closed state and not a glitch to retry.
 */
import { PLANS_PAGE } from './copy/plansPage.js';
import { edgeFunctionUrl } from './functions.js';
import { loadCheckoutAvailability } from './checkoutAvailability.js';
import { supabase } from './supabase.js';

export const CHECKOUT_PLANS = ['monthly', 'yearly'];

/** Anything other than a known plan falls back to monthly, the price the upgrade sheet shows. */
export function checkoutPlan(plan) {
  return CHECKOUT_PLANS.includes(plan) ? plan : 'monthly';
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
 * Call a stripe-billing action as the signed-in viewer and return the URL it
 * answers with (Checkout, the customer portal, a tip). Throws with `status`
 * and `code` set when the server refuses, and 'Not signed in' with no session.
 *
 * @param {string} action 'checkout' | 'portal' | 'tip'
 * @param {object} [body]
 * @param {{ fetchImpl?: typeof fetch, getSessionToken?: () => Promise<string | undefined>, url?: string | null }} [options]
 *   injectable for tests and Storybook
 * @returns {Promise<string>}
 */
export async function fetchBillingUrl(action, body = {}, options = {}) {
  const token = options.getSessionToken
    ? await options.getSessionToken()
    : (await supabase.auth.getSession())?.data?.session?.access_token;
  const url = options.url !== undefined ? options.url : edgeFunctionUrl('stripe-billing', { action });
  if (!token || !url) throw new Error('Not signed in');
  const res = await (options.fetchImpl ?? globalThis.fetch)(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw Object.assign(new Error(data?.error || 'Billing request failed'), { status: res.status, code: data?.code });
  }
  return data.url;
}

/**
 * Ask for a Checkout URL, mapping every outcome to something a screen can show.
 * @param {string} plan
 * @param {{ availability?: Parameters<typeof loadCheckoutAvailability>[0], billing?: Parameters<typeof fetchBillingUrl>[2] }} [options]
 * @returns {Promise<{ kind: 'url', url: string } | { kind: 'closed' } | { kind: 'error', message: string }>}
 */
export async function requestPremiumCheckout(plan, options = {}) {
  const chosen = checkoutPlan(plan);
  // null (unknown) does not block: the checkout call still reports the closed state.
  if ((await loadCheckoutAvailability(options.availability)) === false) return { kind: 'closed' };
  try {
    return { kind: 'url', url: await fetchBillingUrl('checkout', { plan: chosen }, options.billing) };
  } catch (e) {
    if (e?.code === 'premium_coming_soon') return { kind: 'closed' };
    return {
      kind: 'error',
      message: checkoutErrorMessage(e?.status, e?.message, PLANS_PAGE.checkoutMessage, {
        code: e?.code,
        closed: PLANS_PAGE.checkoutClosed,
        unavailable: PLANS_PAGE.checkoutUnavailable,
      }),
    };
  }
}

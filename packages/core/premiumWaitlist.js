/**
 * Premium waitlist for the Custom themes and Smart lists sheets.
 * The Brevo call lives in supabase/functions/premium-waitlist. This module
 * only decides the gate, the address, and whether the join is new.
 *
 * WAITLIST_EMAIL_RE must match supabase/functions/_shared/premiumWaitlist.ts.
 */
import { PREMIUM_WAITLIST } from './copy/premiumWaitlist.js';
import { getConfig } from './config.js';
import { edgeFunctionUrl } from './functions.js';
import { supabase } from './supabase.js';

/** @typedef {'themes' | 'smart_lists'} PremiumWaitlistGate */

export const WAITLIST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {string | null | undefined} reason an UpgradeReason
 * @returns {PremiumWaitlistGate | null}
 */
export function premiumWaitlistGate(reason) {
  if (reason === 'themes') return 'themes';
  if (reason === 'smartLists') return 'smart_lists';
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normaliseWaitlistEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || email.length > 254 || !WAITLIST_EMAIL_RE.test(email)) return null;
  return email;
}

/** @param {unknown} value */
export function isWaitlistEmail(value) {
  return normaliseWaitlistEmail(value) !== null;
}

/**
 * Same browser, same account, same gate. A missing user id is the signed-out bucket.
 * @param {string | null | undefined} userId
 * @param {PremiumWaitlistGate} gate
 */
export function premiumWaitlistStorageKey(userId, gate) {
  const who = userId ? String(userId) : 'anon';
  return `plot.premiumWaitlist.${who}.${gate}`;
}

/**
 * @param {PremiumWaitlistGate} gate
 * @returns {{ headline: string, body: string, notify: string, success: string, emailLabel: string, emailInvalid: string } | null}
 */
export function premiumWaitlistCopy(gate) {
  const feature = PREMIUM_WAITLIST.features[gate];
  if (!feature) return null;
  return {
    headline: PREMIUM_WAITLIST.headline(feature),
    body: PREMIUM_WAITLIST.body,
    notify: PREMIUM_WAITLIST.notify,
    success: PREMIUM_WAITLIST.success,
    emailLabel: PREMIUM_WAITLIST.emailLabel,
    emailInvalid: PREMIUM_WAITLIST.emailInvalid,
  };
}

/**
 * Signed-in callers omit email. The function reads the account address from the JWT.
 * @param {{ gate: PremiumWaitlistGate, email?: string, website?: string, signedIn?: boolean }} input
 */
export function premiumWaitlistRequestBody({ gate, email, website, signedIn = false }) {
  /** @type {{ gate: PremiumWaitlistGate, email?: string, website?: string }} */
  const body = { gate };
  if (!signedIn) {
    const normalised = normaliseWaitlistEmail(email);
    if (normalised) body.email = normalised;
  }
  if (typeof website === 'string' && website.trim()) body.website = website;
  return body;
}

/**
 * @param {{ ok?: boolean, already?: boolean, error?: string } | null | undefined} result
 * @returns {{ joined: boolean, track: boolean, error: 'invalid_email' | 'unavailable' | null }}
 */
export function waitlistJoinOutcome(result) {
  if (result?.ok === true) {
    return { joined: true, track: result.already !== true, error: null };
  }
  return {
    joined: false,
    track: false,
    error: result?.error === 'invalid_email' ? 'invalid_email' : 'unavailable',
  };
}

/**
 * @param {{ gate: PremiumWaitlistGate, email?: string, website?: string, signedIn?: boolean }} input
 * @returns {Promise<{ ok: true, already: boolean } | { ok: false, error: string }>}
 */
export async function joinPremiumWaitlist(input) {
  const url = edgeFunctionUrl('premium-waitlist');
  const cfg = getConfig();
  if (!url || !cfg.supabaseAnonKey) return { ok: false, error: 'unavailable' };

  let token = cfg.supabaseAnonKey;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) token = data.session.access_token;
  } catch { /* signed out, or the client is not configured */ }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(premiumWaitlistRequestBody(input)),
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }

  /** @type {{ ok?: boolean, already?: boolean, error?: string } | null} */
  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON error body */ }
  if (res.ok && payload?.ok === true) return { ok: true, already: payload.already === true };
  return { ok: false, error: typeof payload?.error === 'string' ? payload.error : 'unavailable' };
}

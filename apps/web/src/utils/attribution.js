import { canUseDOM, readStorage, removeStorage, writeStorage } from './storage.js';

/**
 * First-touch acquisition attribution.
 *
 * The marketing site (theplot.tv) forwards utm_* / click-id params and the
 * original referrer onto every app.theplot.tv link (see website/js/config.js).
 * Historically the app never read them back, so the acquisition source died at
 * the domain hop. This module captures those params on first app load, persists
 * the FIRST-touch values, and exposes them so they can be registered as PostHog
 * super/person properties and ride along on signup / activation events.
 */
const KEY = 'plot_attribution';
const SIGNUP_REFERRAL_KEY = 'plot_pending_signup_referral';
const SIGNUP_REFERRAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ATTR_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid', 'ref', 'src', 'referrer',
];

function clean(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().slice(0, 200);
  return v || null;
}

function readFromUrl() {
  const out = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const k of ATTR_KEYS) {
      const v = clean(params.get(k));
      if (v) out[k] = v;
    }
  } catch { /* no parseable search string */ }
  // Fall back to the document referrer host for direct app visits the site
  // didn't tag (e.g. a shared link opened straight on app.theplot.tv).
  if (!out.referrer && canUseDOM() && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) out.referrer = host;
    } catch { /* ignore malformed referrer */ }
  }
  return out;
}

/** Stored first-touch attribution (without internal metadata). */
export function getAttribution() {
  const raw = readStorage(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) || {};
    delete parsed.ts;
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Capture attribution on app entry. First-touch wins: existing stored values are
 * never overwritten, so a later organic visit can't clobber the original source.
 * Returns the first-touch attribution object (possibly empty).
 */
export function captureAttribution() {
  if (!canUseDOM()) return {};
  let stored = {};
  try { stored = JSON.parse(readStorage(KEY)) || {}; } catch { /* fresh */ }

  const merged = { ...readFromUrl(), ...stored }; // stored (first-touch) wins
  if (Object.keys(merged).filter(k => k !== 'ts').length === 0) return {};

  if (!merged.ts) merged.ts = Date.now();
  writeStorage(KEY, JSON.stringify(merged));

  const attribution = { ...merged };
  delete attribution.ts;
  return attribution;
}

/** Bind referral mutation authority to a successful new-account creation. */
export function markSignupReferralPending(email) {
  if (!getAttribution().ref || !email) return;
  writeStorage(SIGNUP_REFERRAL_KEY, JSON.stringify({
    email: String(email).trim().toLowerCase(),
    createdAt: Date.now(),
  }));
}

/** Consume the signup marker only for the same mailbox and a short time window. */
export function consumeSignupReferralPending(email, now = Date.now()) {
  const raw = readStorage(SIGNUP_REFERRAL_KEY);
  if (!raw) return false;
  removeStorage(SIGNUP_REFERRAL_KEY);
  try {
    const parsed = JSON.parse(raw);
    return parsed?.email === String(email || '').trim().toLowerCase()
      && Number.isFinite(parsed?.createdAt)
      && now - parsed.createdAt >= 0
      && now - parsed.createdAt <= SIGNUP_REFERRAL_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Whether Plot Premium checkout is open for the current caller.
 * The billing-availability edge function is the source of truth. A failed
 * read is `null` (unknown), not "closed": the checkout call still maps
 * `premium_coming_soon` onto the closed state, so a missing function does
 * not show a generic error and does not hide an open checkout.
 */
import { edgeFunctionUrl } from './functions.js';
import { getConfig } from './config.js';
import { supabase } from './supabase.js';

/**
 * @param {boolean | null | undefined} checkoutAvailable
 * @returns {'open' | 'closed' | 'unknown'}
 */
export function premiumPurchaseState(checkoutAvailable) {
  if (checkoutAvailable === true) return 'open';
  if (checkoutAvailable === false) return 'closed';
  return 'unknown';
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   getSessionToken?: () => Promise<string | undefined>,
 *   url?: string | null,
 *   anonKey?: string,
 * }} [options]
 * @returns {Promise<boolean | null>}
 */
export async function loadCheckoutAvailability(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let url = options.url;
  if (url === undefined) {
    try {
      url = edgeFunctionUrl('billing-availability');
    } catch {
      return null;
    }
  }
  if (!url) return null;

  const anonKey = options.anonKey ?? getConfig().supabaseAnonKey;
  let token = anonKey || undefined;
  try {
    const sessionToken = options.getSessionToken
      ? await options.getSessionToken()
      : (await supabase.auth.getSession())?.data?.session?.access_token;
    if (sessionToken) token = sessionToken;
  } catch {
    // No client yet (Storybook, a signed-out first paint). Ask without a user.
  }

  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) headers.apikey = anonKey;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetchImpl(url, { method: 'POST', headers, body: '{}' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.checkoutAvailable === true) return true;
    if (data?.checkoutAvailable === false) return false;
    return null;
  } catch {
    return null;
  }
}

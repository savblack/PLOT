// Shared Cache API helpers for marketing Pages Functions. Cloudflare does not
// cache Function responses by itself (cf-cache-status: DYNAMIC), so every
// uncached request is a Supabase invocation and that many bytes of egress.

/**
 * Whether a response is worth keeping. The Edge Function says how long a page
 * may be shared (s-maxage) and only sends it on success, so that is the whole
 * rule: a 404, a 5xx, or anything the function did not mark shareable is never
 * stored.
 *
 * @param {number} status
 * @param {string | null} cacheControl
 */
export function cacheable(status, cacheControl) {
  return (status === 200 || status === 301) && /(^|[\s,])s-maxage=[1-9]\d*/i.test(cacheControl || '');
}

/** A copy of a response with an X-Plot-Cache header, so a hit is visible. */
export function tagged(response, state) {
  const headers = new Headers(response.headers);
  headers.set('X-Plot-Cache', state);
  return new Response(response.body, { status: response.status, headers });
}

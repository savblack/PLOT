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

// Cloudflare's Cache API ignores stale-while-revalidate: it drops an entry
// once s-maxage runs out, so the first reader after every window waited for a
// full render (about 4 s for What's On from a cold Edge Function). These
// helpers honour the directive themselves. An entry is kept for s-maxage +
// stale-while-revalidate and stamped with when it was stored; past s-maxage
// it is still served at once while a fresh copy is fetched in the background.
const STORED_AT = 'X-Plot-Stored-At';
const SHARED_CC = 'X-Plot-Cache-Control';

/**
 * How long a page counts as fresh, and how much longer an old copy may be
 * served while a new one is fetched, in seconds, read from Cache-Control.
 *
 * @param {string | null} cacheControl
 */
export function cacheWindows(cacheControl) {
  const seconds = (name) => {
    const match = new RegExp(`(?:^|[\\s,])${name}=(\\d+)`, 'i').exec(cacheControl || '');
    return match ? Number(match[1]) : 0;
  };
  return { fresh: seconds('s-maxage'), stale: seconds('stale-while-revalidate') };
}

/**
 * The copy put in the Cache API: kept for the fresh and stale windows
 * together, stamped with when it was stored, and carrying the Cache-Control
 * readers should see so it can be restored on the way out.
 *
 * @param {Response} response
 * @param {number} now ms since the epoch
 */
export function storedCopy(response, now) {
  const cacheControl = response.headers.get('cache-control') || '';
  const { fresh, stale } = cacheWindows(cacheControl);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `public, max-age=${fresh + stale}`);
  headers.set(STORED_AT, String(now));
  headers.set(SHARED_CC, cacheControl);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * 'fresh' inside s-maxage, 'stale' inside the stale-while-revalidate window
 * after it, 'expired' beyond both. An entry stored before stamping existed
 * has no stamp; the Cache API already expires it at s-maxage, so it counts as
 * fresh.
 *
 * @param {Response} hit
 * @param {number} now ms since the epoch
 */
export function freshness(hit, now) {
  const storedAt = Number(hit.headers.get(STORED_AT));
  if (!storedAt) return 'fresh';
  const { fresh, stale } = cacheWindows(hit.headers.get(SHARED_CC));
  const age = (now - storedAt) / 1000;
  if (age < fresh) return 'fresh';
  return age < fresh + stale ? 'stale' : 'expired';
}

/** A stored copy as readers get it: their Cache-Control, no internal stamps. */
function served(hit, state) {
  const response = tagged(hit, state);
  const shared = response.headers.get(SHARED_CC);
  if (shared) response.headers.set('Cache-Control', shared);
  response.headers.delete(SHARED_CC);
  response.headers.delete(STORED_AT);
  return response;
}

/**
 * Store a response if it is shareable. Anything else stores nothing, so a
 * stale copy already in the cache stays in place.
 *
 * @param {Cache} cache
 * @param {Request} cacheKey
 * @param {Response} response
 */
export function keep(cache, cacheKey, response) {
  if (!cacheable(response.status, response.headers.get('cache-control'))) return Promise.resolve();
  return cache.put(cacheKey, storedCopy(response.clone(), Date.now())).catch(() => {});
}

/**
 * Look a page up. Fresh: served as a hit. Stale: served at once, and for a
 * GET refreshed in the background with `render` (a HEAD never fills the
 * cache). Missing, expired, or a cache fault: null, so the caller renders.
 *
 * @param {Cache} cache
 * @param {Request} cacheKey
 * @param {{ method: string, render: () => Promise<Response | null>, waitUntil?: (p: Promise<unknown>) => void }} options
 */
export async function lookup(cache, cacheKey, { method, render, waitUntil }) {
  let hit;
  try {
    hit = await cache.match(cacheKey);
  } catch { return null; /* a cache fault falls through to a render */ }
  if (!hit) return null;
  const state = freshness(hit, Date.now());
  if (state === 'fresh') return served(hit, 'hit');
  if (state === 'expired') return null;
  if (method === 'GET') {
    const refresh = Promise.resolve()
      .then(render)
      .then((fresh) => fresh && keep(cache, cacheKey, fresh))
      .catch(() => {});
    if (waitUntil) waitUntil(refresh); else await refresh;
  }
  return served(hit, 'stale');
}

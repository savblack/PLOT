/**
 * Where TMDB may send a person back to after they approve Plot
 * (tmdb-account): the app's own /auth/tmdb callback on a host Plot serves, or
 * the iPhone app's link. Anything else is refused, so Plot's approval link
 * cannot be used to bounce someone to another site.
 */
export function allowedTmdbRedirect(value: string): boolean {
  if (value === 'plot://auth/tmdb') return true;
  try {
    const url = new URL(value);
    if (url.pathname !== '/auth/tmdb' || url.username || url.password) return false;
    const { hostname, protocol } = url;
    if (protocol === 'http:') return hostname === 'localhost' || hostname === '127.0.0.1';
    if (protocol !== 'https:') return false;
    return hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv') || hostname.endsWith('.plot-5wr.pages.dev');
  } catch {
    return false;
  }
}

/**
 * Ties a TMDB request token to the Plot account that asked for it. `start`
 * hands this back with the token and `fetch` requires it, so an approved
 * token that leaks (a log, a screenshot) cannot be cashed in by any other
 * Plot account. The secret is the function's service key, under its own
 * label so the value is useless anywhere else.
 */
export async function tmdbTokenBinding(secret: string, userId: string, requestToken: string): Promise<string> {
  if (!secret) throw new Error('No secret to bind the TMDB token with');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(`tmdb-account:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${userId}:${requestToken}`));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * TMDB's own answer that a request token cannot become a session: not
 * approved or denied (17), expired or invalid (33), or invalid (6). Anything
 * else (rate limit, a bad key, an outage) is not the person's doing.
 */
export function tmdbTokenRefused(statusCode: number | null): boolean {
  return statusCode === 17 || statusCode === 33 || statusCode === 6;
}

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

/**
 * Destinations for a verified availability offer.
 *
 * Provider search pages are deliberately not a fallback: a search can surface
 * a different title, format, or offer. A link is only actionable when the
 * availability resolver supplied the provider's title URL, or when TMDB/JustWatch
 * supplied the region-specific title page as the safe fallback.
 *
 * @typedef {Object} WatchLink
 * @property {string} url
 * @property {'provider'|'justwatch'} kind
 */

const validHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

/**
 * @param {{providerUrl?: string|null, justwatchLink?: string|null}} args
 * @returns {WatchLink|null}
 */
export function buildWatchLink({ providerUrl, justwatchLink }) {
  const direct = validHttpUrl(providerUrl);
  if (direct) return { url: direct, kind: 'provider' };
  const titlePage = validHttpUrl(justwatchLink);
  return titlePage ? { url: titlePage, kind: 'justwatch' } : null;
}

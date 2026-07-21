import { getConfig } from './config.js';

const OFFER_TYPES = {
  flatrate: 'Subscription',
  rent: 'Rent',
  buy: 'Buy',
  free: 'Free',
  ads: 'Free with ads',
};

/**
 * Convert TMDB's region bucket into explicit offers. TMDB verifies availability
 * but intentionally does not include provider clickouts or prices.
 *
 * @param {any} regionData
 * @returns {Array<{providerId: number, providerName: string, logoPath: string|null, offerType: string, price: number|null, currency: string|null, providerUrl: string|null}>}
 */
export function offersFromTmdb(regionData = {}) {
  return Object.entries(OFFER_TYPES).flatMap(([key, offerType]) =>
    (regionData?.[key] || []).map((provider) => ({
      providerId: provider.provider_id,
      providerName: provider.provider_name,
      logoPath: provider.logo_path || null,
      offerType,
      price: null,
      currency: null,
      providerUrl: null,
    }))
  );
}

/** @param {number|null|undefined} price @param {string|null|undefined} currency @param {string} [locale] */
export function formatOfferPrice(price, currency, locale = 'en-AU') {
  if (!Number.isFinite(price) || !currency) return null;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

/**
 * Fetch partner-verified offers by immutable TMDB id. Returns null when the
 * partner integration is not configured or temporarily unavailable so callers
 * can retain the verified TMDB availability display without fabricating prices.
 *
 * @param {{tmdbId: number|string, mediaType: 'movie'|'tv', region: string}} args
 */
export async function fetchVerifiedAvailability({ tmdbId, mediaType, region }) {
  const { watchAvailabilityUrl, supabaseAnonKey } = getConfig();
  if (!watchAvailabilityUrl || !tmdbId || !region) return null;
  try {
    const url = new URL(watchAvailabilityUrl);
    url.searchParams.set('tmdb_id', String(tmdbId));
    url.searchParams.set('media_type', mediaType);
    url.searchParams.set('region', region);
    const response = await fetch(url, {
      headers: supabaseAnonKey ? { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey } : {},
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.title_verified === true && Array.isArray(data.offers) ? data : null;
  } catch {
    return null;
  }
}

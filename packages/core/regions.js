/**
 * Canonical region list — the single source of truth for every region picker
 * (web onboarding + settings, mobile onboarding + settings) and for validating
 * the country code that onboarding's IP geolocation returns.
 *
 * Codes are ISO 3166-1 alpha-2, which is also what TMDB's `watch/providers`
 * and release-date endpoints expect.
 *
 * Order is popularity, not alphabetical, so the regions most people are looking
 * for sit at the top of the two-column grid. The first three come from PLOT's
 * own numbers (US, AU and IN are the only regions with enough traffic to rank
 * on real data); the rest are ordered by streaming-market size, since PLOT's
 * tail is still too small to rank. Revisit once the tail has real volume.
 *
 * Adding a region here adds it to all four pickers at once, so check that TMDB
 * has provider data for it before extending the list.
 *
 * @typedef {{ code: string, name: string }} Region
 */

/** @type {readonly Region[]} */
export const REGIONS = [
  { code: 'US', name: 'United States' }, { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },         { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },        { code: 'NZ', name: 'New Zealand' },
  { code: 'DE', name: 'Germany' },       { code: 'FR', name: 'France' },
  { code: 'BR', name: 'Brazil' },        { code: 'JP', name: 'Japan' },
  { code: 'MX', name: 'Mexico' },        { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },         { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },        { code: 'SG', name: 'Singapore' },
];

/**
 * Codes only, derived from REGIONS so the pickers and the supported-code
 * checks can never drift apart.
 * @type {readonly string[]}
 */
export const SUPPORTED_REGIONS = REGIONS.map(r => r.code);

const SUPPORTED_REGION_SET = new Set(SUPPORTED_REGIONS);

/** The region PLOT falls back to when detection fails or returns something unsupported. */
export const DEFAULT_REGION = 'US';

/**
 * True when `code` is a region PLOT offers. Used to vet the country code from
 * /api/region before it overrides the timezone guess.
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function isSupportedRegion(code) {
  return SUPPORTED_REGION_SET.has(String(code || '').toUpperCase());
}

/**
 * Display name for a region code, falling back to the code itself so an older
 * profile row holding a since-removed region still renders something readable.
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function regionName(code) {
  return REGIONS.find(r => r.code === code)?.name ?? String(code ?? '');
}

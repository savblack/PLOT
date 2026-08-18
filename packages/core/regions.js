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

/* ── Detection ──────────────────────────────────────────────────────────────
 * Onboarding no longer asks for a region: it detects one. The timezone map is
 * the cheap synchronous guess, refined by IP geolocation where available. Both
 * apps read profiles.region at boot to set the TMDB region, so onboarding still
 * has to write a value; these helpers make sure it always has one to write.
 */

const TZ_MAP = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG',
  'Pacific/Auckland': 'NZ',
};

/**
 * Device IANA timezone (e.g. "Australia/Sydney"), or "UTC" where unsupported.
 * @returns {string}
 */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Cheap synchronous first guess, good enough to render with immediately.
 * Always a region from SUPPORTED_REGIONS: falls back to DEFAULT_REGION if
 * the matching TZ_MAP entry isn't (or is no longer) in REGIONS, so a
 * TZ_MAP/REGIONS drift can never hand back a code the rest of the app
 * doesn't recognize.
 * @param {string} [timezone]
 * @returns {string}
 */
export function guessRegionFromTimezone(timezone = detectTimezone()) {
  // Any Australian zone maps to AU, not just the three listed above.
  const guess = timezone.startsWith('Australia/') ? 'AU' : TZ_MAP[timezone];
  return isSupportedRegion(guess) ? guess : DEFAULT_REGION;
}

/**
 * Refine the timezone guess with IP geolocation. The endpoint differs per
 * platform (web hits its own /api/region, mobile the deployed one), so it is
 * passed in. Never throws and never returns null or an unsupported code: the
 * caller-supplied fallback is validated too, not just the geolocation result,
 * since this is what ultimately gets written to profiles.region when nothing
 * better is available.
 * @param {{ endpoint?: string, fetchImpl?: typeof fetch, fallback?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function detectRegion({
  endpoint,
  fetchImpl = fetch,
  fallback = guessRegionFromTimezone(),
} = {}) {
  const safeFallback = isSupportedRegion(fallback) ? fallback : DEFAULT_REGION;

  if (!endpoint) return safeFallback;

  try {
    const res = await fetchImpl(endpoint);
    if (!res?.ok) return safeFallback;

    const data = await res.json();
    if (isSupportedRegion(data?.country)) return String(data.country).toUpperCase();
  } catch {
    /* keep the timezone guess */
  }

  return safeFallback;
}

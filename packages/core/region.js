// Region detection, shared by the web app (src/pages/OnboardingFlow.jsx) and
// the mobile app (app/onboarding/seed.tsx). Onboarding used to ask the user to
// pick a region on its own step; it now detects one instead, so the timezone
// map and the IP-geolocation call live here rather than being duplicated per
// platform. Both apps read profiles.region at boot to set the TMDB region, so
// onboarding still has to write a value — it just doesn't ask for it.

// Codes the app has availability data for. Mirrors the region pickers users can
// still change this in (web SettingsView, mobile app/(app)/settings.tsx), which
// each keep their own list with display names; a detected country outside this
// set falls back to the timezone guess.
export const SUPPORTED_REGIONS = [
  'US', 'AU', 'GB', 'CA', 'NZ', 'FR', 'DE', 'JP',
  'IN', 'BR', 'MX', 'IT', 'ES', 'NL', 'SE', 'SG',
];

const TZ_MAP = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG',
  'Pacific/Auckland': 'NZ',
};

const FALLBACK_REGION = 'US';

/** Device IANA timezone (e.g. "Australia/Sydney"), or "UTC" where unsupported. */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Cheap synchronous first guess, good enough to render with immediately. */
export function guessRegionFromTimezone(timezone = detectTimezone()) {
  // Any Australian zone maps to AU, not just the three listed above.
  if (timezone.startsWith('Australia/')) return 'AU';
  return TZ_MAP[timezone] || FALLBACK_REGION;
}

/**
 * Refine the timezone guess with IP geolocation. The endpoint differs per
 * platform (web hits its own /api/region, mobile the deployed one), so it is
 * passed in. Never throws and never returns null: on any failure the timezone
 * guess stands, since onboarding has to write some region.
 */
export async function detectRegion({
  endpoint,
  fetchImpl = fetch,
  fallback = guessRegionFromTimezone(),
} = {}) {
  if (!endpoint) return fallback;

  try {
    const res = await fetchImpl(endpoint);
    if (!res?.ok) return fallback;

    const data = await res.json();
    if (data?.country && SUPPORTED_REGIONS.includes(data.country)) return data.country;
  } catch {
    /* keep the timezone guess */
  }

  return fallback;
}

// Pure helpers for the onboarding flow (save a few, the switching-apps branch,
// where do you watch, then the building moment). Rendering stays per app.

import { ONBOARDING_FLOW } from './copy/onboardingFlow.js';

/** @typedef {'seed' | 'import' | 'services' | 'building'} OnboardingStep */

/**
 * The progress bar has three parts. The switching-apps branch is part of the
 * first step, so it shows the same progress as "save a few".
 *
 * @type {Record<OnboardingStep, number>}
 */
export const ONBOARDING_PROGRESS = { seed: 1, import: 1, services: 2, building: 3 };
export const ONBOARDING_PROGRESS_TOTAL = 3;

/**
 * The switching-apps sources, in order. Ids are the web import's platform ids,
 * so a pick can open the import straight on that source.
 *
 * @type {ReadonlyArray<{ id: 'letterboxd' | 'trakt' | 'netflix' | 'plex', name: string, hint: string }>}
 */
export const IMPORT_SOURCES = [
  { id: 'letterboxd', name: 'Letterboxd', hint: ONBOARDING_FLOW.importSources.letterboxd },
  { id: 'trakt', name: 'Trakt', hint: ONBOARDING_FLOW.importSources.trakt },
  { id: 'netflix', name: 'Netflix', hint: ONBOARDING_FLOW.importSources.netflix },
  { id: 'plex', name: 'Plex', hint: ONBOARDING_FLOW.importSources.plex },
];

/** How many services the picker shows before "more in Settings". */
export const ONBOARDING_SERVICE_COUNT = 8;

/**
 * First name from the sign-in provider's profile, when it gave one. Google
 * sends given_name and full_name; Apple only sends a name on the first
 * sign-in; email sign-ups have none, and the app reads fine without it.
 *
 * @param {{ user_metadata?: Record<string, unknown> } | null | undefined} user
 * @returns {string}
 */
export function firstNameFromAuthUser(user) {
  const meta = user?.user_metadata || {};
  for (const key of ['given_name', 'first_name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const key of ['full_name', 'name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) {
      const first = value.trim().split(/\s+/)[0];
      // An email address in the name field is not a name.
      if (first && !first.includes('@')) return first;
    }
  }
  return '';
}

/**
 * The region's subscription services, most popular first.
 *
 * @param {Array<{ provider_id: number, provider_name: string, logo_path?: string | null, display_priority?: number }>} results
 * @param {number} [limit]
 * @returns {Array<{ id: number, name: string, logo_path: string | null }>}
 */
export function topRegionServices(results, limit = ONBOARDING_SERVICE_COUNT) {
  return [...(results || [])]
    .filter(p => p && typeof p.provider_id === 'number' && p.provider_name)
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .slice(0, limit)
    .map(p => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path ?? null }));
}

/**
 * Provider ids a title streams on (subscription only) in one region, from a
 * TMDB /watch/providers response.
 *
 * @param {{ results?: Record<string, { flatrate?: Array<{ provider_id: number }> }> } | null | undefined} data
 * @param {string} region
 * @returns {number[]}
 */
export function streamingProviderIds(data, region) {
  const flatrate = data?.results?.[region]?.flatrate || [];
  return flatrate.map(p => p.provider_id).filter(id => typeof id === 'number');
}

/**
 * How many of the saved picks stream on at least one selected service.
 *
 * @param {number[][]} providerIdsByPick
 * @param {number[]} selectedIds
 * @returns {number}
 */
export function picksOnServices(providerIdsByPick, selectedIds) {
  const selected = new Set(selectedIds);
  return providerIdsByPick.filter(ids => ids.some(id => selected.has(id))).length;
}

/**
 * The building moment's rotating lines.
 *
 * @param {boolean} hasServices
 * @returns {string[]}
 */
export function buildingLines(hasServices) {
  const [first, ...rest] = ONBOARDING_FLOW.building.lines;
  return [hasServices ? first : ONBOARDING_FLOW.building.noServicesFirstLine, ...rest];
}

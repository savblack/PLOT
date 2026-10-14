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
 * The switching-apps sources, in two lanes. Ids are the import page's platform
 * ids and the import_jobs sources, so a pick enqueues straight on that source.
 * Connect sources pull the history themselves; upload sources take an export
 * file (accept / formats feed the file picker). Order is tile order.
 *
 * @typedef {{ id: string, name: string, lane: 'connect' | 'upload', hint: string,
 *   accept?: string, formats?: string, steps?: string[], noRatings?: boolean, flag?: 'tvtime' }} ImportSource
 * @type {ReadonlyArray<ImportSource>}
 */
export const IMPORT_SOURCES = [
  { id: 'trakt', name: 'Trakt', lane: 'connect', hint: ONBOARDING_FLOW.importSources.trakt },
  { id: 'plex', name: 'Plex', lane: 'connect', hint: ONBOARDING_FLOW.importSources.plex },
  { id: 'simkl', name: 'Simkl', lane: 'connect', hint: ONBOARDING_FLOW.importSources.simkl },
  { id: 'letterboxd', name: 'Letterboxd', lane: 'upload', hint: ONBOARDING_FLOW.importSources.letterboxd, accept: '.csv,.zip', formats: 'CSV or ZIP', steps: ONBOARDING_FLOW.importSources.steps.letterboxd },
  { id: 'netflix', name: 'Netflix', lane: 'upload', hint: ONBOARDING_FLOW.importSources.netflix, accept: '.csv', formats: 'CSV', steps: ONBOARDING_FLOW.importSources.steps.netflix, noRatings: true },
  { id: 'prime', name: 'Prime Video', lane: 'upload', hint: ONBOARDING_FLOW.importSources.prime, accept: '.csv', formats: 'CSV', steps: ONBOARDING_FLOW.importSources.steps.prime, noRatings: true },
  { id: 'disney', name: 'Disney+', lane: 'upload', hint: ONBOARDING_FLOW.importSources.disney, accept: '.json', formats: 'JSON', steps: ONBOARDING_FLOW.importSources.steps.disney, noRatings: true },
  { id: 'max', name: 'Max', lane: 'upload', hint: ONBOARDING_FLOW.importSources.max, accept: '.csv,.json', formats: 'CSV or JSON', steps: ONBOARDING_FLOW.importSources.steps.max, noRatings: true },
  { id: 'apple', name: 'Apple TV+', lane: 'upload', hint: ONBOARDING_FLOW.importSources.apple, accept: '.json', formats: 'JSON', steps: ONBOARDING_FLOW.importSources.steps.apple, noRatings: true },
  { id: 'tvtime', name: 'TV Time', lane: 'upload', hint: ONBOARDING_FLOW.importSources.tvtime, accept: '.csv,.json,.zip', formats: 'CSV, JSON or ZIP', steps: ONBOARDING_FLOW.importSources.steps.tvtime, flag: 'tvtime' },
  { id: 'imdb', name: 'IMDb', lane: 'upload', hint: ONBOARDING_FLOW.importSources.imdb, accept: '.csv', formats: 'CSV', steps: ONBOARDING_FLOW.importSources.steps.imdb },
];

/**
 * The sources an app can offer right now: a flagged source only when its
 * flag is on.
 * @param {{ tvTimeImportEnabled?: boolean }} [config]
 * @returns {ImportSource[]}
 */
export function availableImportSources(config = {}) {
  return IMPORT_SOURCES.filter(src => src.flag !== 'tvtime' || !!config.tvTimeImportEnabled);
}

/** @param {string | null | undefined} id */
export const findImportSource = (id) => IMPORT_SOURCES.find(src => src.id === id) || null;

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
 * The building moment's three fanned posters, back left, back right, then the
 * one in front. Their first pick goes in front; other picks, then trending
 * titles they didn't pick, fill the two behind, so one or two picks still
 * make a full fan.
 *
 * @template {{ id: number }} T
 * @param {T[]} picks
 * @param {T[]} trending
 * @returns {T[]} up to three, front last
 */
export function buildingFan(picks, trending) {
  const picked = new Set(picks.map(p => p.id));
  const [front, ...rest] = picks.length ? picks : trending;
  if (!front) return [];
  const behind = [...rest, ...trending.filter(t => !picked.has(t.id) && t.id !== front.id)].slice(0, 2);
  return [...behind, front];
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

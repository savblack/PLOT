// Post-save / post-watch-link “Mark as watched” prompt (PLO-473) and the
// post–mark-watched rate prompt (PLO-474).
//
// Storage *mechanism* differs per platform (web localStorage sync, mobile
// AsyncStorage async), but the key, JSON shape, and TTL must not. Callers
// read/write the raw string; this module owns parse / serialise / eligibility.

/** @typedef {'watch' | 'rate'} EngagementPromptKind */

export const ENGAGEMENT_SNOOZE_KEY = 'plot_engagement_prompt_snooze';

/** 14 days — dismiss “Not yet” on the watch prompt. */
export const WATCH_PROMPT_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** 7 days — “Skip for now” on the rate prompt. */
export const RATE_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {number|string} tmdbId
 * @param {string} mediaType
 * @returns {string}
 */
export function engagementTitleKey(tmdbId, mediaType) {
  return `${mediaType}:${Number(tmdbId)}`;
}

/**
 * @param {string | null | undefined} raw
 * @returns {Record<string, { watch?: number, rate?: number }>}
 */
export function parseEngagementSnooze(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    /** @type {Record<string, { watch?: number, rate?: number }>} */
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const watch = Number(value.watch);
      const rate = Number(value.rate);
      const entry = {};
      if (Number.isFinite(watch) && watch > 0) entry.watch = watch;
      if (Number.isFinite(rate) && rate > 0) entry.rate = rate;
      if (entry.watch || entry.rate) out[key] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, { watch?: number, rate?: number }>} map
 * @returns {string}
 */
export function serialiseEngagementSnooze(map) {
  return JSON.stringify(map && typeof map === 'object' ? map : {});
}

/**
 * @param {Record<string, { watch?: number, rate?: number }>} map
 * @param {string} titleKey
 * @param {EngagementPromptKind} kind
 * @param {number} [now]
 * @returns {boolean}
 */
export function isEngagementSnoozed(map, titleKey, kind, now = Date.now()) {
  const until = map?.[titleKey]?.[kind];
  return Number.isFinite(until) && until > now;
}

/**
 * @param {Record<string, { watch?: number, rate?: number }>} map
 * @param {string} titleKey
 * @param {EngagementPromptKind} kind
 * @param {number} durationMs
 * @param {number} [now]
 * @returns {Record<string, { watch?: number, rate?: number }>}
 */
export function snoozeEngagement(map, titleKey, kind, durationMs, now = Date.now()) {
  const next = { ...(map || {}) };
  const existing = { ...(next[titleKey] || {}) };
  existing[kind] = now + durationMs;
  next[titleKey] = existing;
  return next;
}

/**
 * Drop a snooze entry after the user acts (mark watched / rate), so a later
 * re-save or re-watch on the same title is not blocked by an old dismiss.
 *
 * @param {Record<string, { watch?: number, rate?: number }>} map
 * @param {string} titleKey
 * @param {EngagementPromptKind} [kind]  omit to clear both kinds for the title
 * @returns {Record<string, { watch?: number, rate?: number }>}
 */
export function clearEngagementSnooze(map, titleKey, kind) {
  const next = { ...(map || {}) };
  if (!next[titleKey]) return next;
  if (!kind) {
    delete next[titleKey];
    return next;
  }
  const existing = { ...next[titleKey] };
  delete existing[kind];
  if (!existing.watch && !existing.rate) delete next[titleKey];
  else next[titleKey] = existing;
  return next;
}

/**
 * @param {{ watched: boolean, snoozed: boolean }} state
 * @returns {boolean}
 */
export function canShowWatchPrompt({ watched, snoozed }) {
  return !watched && !snoozed;
}

/**
 * @param {{ watched: boolean, hasRating: boolean, snoozed: boolean }} state
 * @returns {boolean}
 */
export function canShowRatePrompt({ watched, hasRating, snoozed }) {
  return !!watched && !hasRating && !snoozed;
}

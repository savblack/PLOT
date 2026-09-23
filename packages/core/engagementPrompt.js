// Post-save / post-watch-link “Mark as watched” prompt (PLO-473) and the
// post–mark-watched rate prompt (PLO-474).
//
// Storage *mechanism* differs per platform (web localStorage sync, mobile
// AsyncStorage async), but the key, JSON shape, and TTL must not. Callers
// read/write the raw string; this module owns parse / serialise / eligibility.

/** @typedef {'watch' | 'rate'} EngagementPromptKind */

/** @typedef {{ kind: 'watch', tmdbId: number, mediaType: string, at: number }} EngagementPending */

export const ENGAGEMENT_SNOOZE_KEY = 'plot_engagement_prompt_snooze';
export const ENGAGEMENT_PENDING_KEY = 'plot_engagement_prompt_pending';

/** 14 days — dismiss “Not yet” on the watch prompt. */
export const WATCH_PROMPT_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** 7 days — “Skip for now” on the rate prompt. */
export const RATE_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** Pending watch prompt from an out-of-panel save stays hot for one session. */
export const PENDING_WATCH_TTL_MS = 4 * 60 * 60 * 1000;

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

/**
 * @param {string | null | undefined} raw
 * @returns {EngagementPending | null}
 */
export function parseEngagementPending(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.kind !== 'watch') return null;
    const tmdbId = Number(parsed.tmdbId);
    const at = Number(parsed.at);
    const mediaType = parsed.mediaType === 'tv' ? 'tv' : parsed.mediaType === 'movie' ? 'movie' : null;
    if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !mediaType || !Number.isFinite(at)) return null;
    return { kind: 'watch', tmdbId, mediaType, at };
  } catch {
    return null;
  }
}

/**
 * @param {EngagementPending | null | undefined} pending
 * @returns {string}
 */
export function serialiseEngagementPending(pending) {
  return JSON.stringify(pending ?? null);
}

/**
 * @param {number|string} tmdbId
 * @param {string} mediaType
 * @param {number} [now]
 * @returns {EngagementPending}
 */
export function buildPendingWatch(tmdbId, mediaType, now = Date.now()) {
  return {
    kind: 'watch',
    tmdbId: Number(tmdbId),
    mediaType: mediaType === 'tv' ? 'tv' : 'movie',
    at: now,
  };
}

/**
 * @param {EngagementPending | null | undefined} pending
 * @param {number} [now]
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
export function isPendingWatchFresh(pending, now = Date.now(), ttlMs = PENDING_WATCH_TTL_MS) {
  if (!pending || pending.kind !== 'watch') return false;
  return Number.isFinite(pending.at) && now - pending.at <= ttlMs;
}

/**
 * @param {EngagementPending | null | undefined} pending
 * @param {number|string} tmdbId
 * @param {string} mediaType
 * @param {number} [now]
 * @returns {boolean}
 */
export function pendingWatchMatches(pending, tmdbId, mediaType, now = Date.now()) {
  if (!isPendingWatchFresh(pending, now)) return false;
  return pending.tmdbId === Number(tmdbId) && pending.mediaType === mediaType;
}

/** @type {Set<(payload: { tmdb_id: number, mediaType: string, source?: string }) => void>} */
const watchQueuedListeners = new Set();

/**
 * App shells subscribe so an out-of-panel save can open the title panel in the
 * same session. Core never opens UI; it only notifies.
 *
 * @param {(payload: { tmdb_id: number, media_type: string, source?: string }) => void} fn
 * @returns {() => void}
 */
export function onPendingWatchQueued(fn) {
  watchQueuedListeners.add(fn);
  return () => { watchQueuedListeners.delete(fn); };
}

/**
 * @param {{ tmdb_id: number, media_type: string, source?: string }} payload
 */
export function notifyPendingWatchQueued(payload) {
  for (const fn of watchQueuedListeners) {
    try { fn(payload); } catch { /* listener errors must not break saves */ }
  }
}

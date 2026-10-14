/**
 * Which title, if any, to ask for a rating. Pure, shared by both apps.
 *
 * The most recent history row that is watched, not a did-not-finish, has no
 * rating, was watched within `maxAgeDays`, and was not dismissed. One card,
 * never a queue: the second-most-recent unrated title is simply not asked
 * about until the first is rated or dismissed.
 */
import { calendarParts } from './historyStats.js';
import { RATE_PROMPT } from './copy/ratePrompt.js';

/** How long after watching the card keeps asking. */
export const RATE_PROMPT_MAX_AGE_DAYS = 3;

/** @param {{ tmdb_id: number, media_type: string }} entry */
export const ratePromptKey = (entry) => `${entry.media_type || 'movie'}:${entry.tmdb_id}`;

/**
 * Days since the entry's watched_at, in calendar days read off the string so
 * a date-only value never rolls back a day in western timezones.
 * @param {{ watched_at?: string | null }} entry
 * @param {Date} now
 */
export function daysSinceWatched(entry, now = new Date()) {
  const p = calendarParts(entry.watched_at);
  if (!p) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
  return today - Date.UTC(p.year, p.month, p.day) / 86400000;
}

/**
 * @param {Array<{ tmdb_id: number, media_type: string, title?: string, poster_path?: string|null, rating?: number|null, dnf?: boolean, watched_at?: string|null }>} entries newest first
 * @param {{ now?: Date, dismissed?: Set<string>, maxAgeDays?: number }} [opts]
 */
export function ratePromptCandidate(entries, { now = new Date(), dismissed = new Set(), maxAgeDays = RATE_PROMPT_MAX_AGE_DAYS } = {}) {
  for (const e of entries ?? []) {
    if (e.rating != null || e.dnf) continue;
    if (dismissed.has(ratePromptKey(e))) continue;
    const days = daysSinceWatched(e, now);
    if (days == null || days < 0 || days > maxAgeDays) continue;
    return e;
  }
  return null;
}

/** "Watched last night", for the card's second line. @param {number} days */
export function watchedAgoLabel(days) {
  if (days <= 0) return RATE_PROMPT.watchedToday;
  if (days === 1) return RATE_PROMPT.watchedYesterday;
  return RATE_PROMPT.watchedDaysAgo(days);
}

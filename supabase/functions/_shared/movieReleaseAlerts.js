// Rules for movie release notifications (supabase/functions/movie-release-notifications).
//
// Free, in-app: someone who has a movie on one of their lists is told on the
// day it first becomes something they can go and see in their own region, in
// cinemas or to watch at home. The episode equivalent is new_episode.
//
// Pure functions, so the rules that decide whether someone is told are tested
// with node --test (apps/web/tests/unit/movieReleaseAlerts.test.js) without
// Deno, a database or TMDB. The bar is the same as Premium alerts: a false
// alert is worse than a late one, so anything these cannot establish from the
// data comes back null, and null means "say nothing this run".
//
// Release dates come from premiumAlerts.js (regionalReleases): the first
// general theatrical or digital release in the person's region. A premiere, a
// limited run, a physical or TV release never counts.

import { regionalReleases } from './premiumAlerts.js';

// How far back a release still counts as new. The job runs daily; three days
// lets a missed run or two heal, and the dedupe key stops repeats. Same as the
// people alerts, so the two jobs agree on what "just out" means.
export const MOVIE_LOOK_BACK_DAYS = 3;

// list_items.release_date is TMDB's primary date, which is usually the earliest
// release anywhere. A region can get a film months later (an Australian digital
// release after a US cinema run), so the pre-filter is generous on the past
// side and only a little forward: a region almost never gets a film before its
// primary date. It exists to keep the daily TMDB calls to films that could
// plausibly be out, not to decide who is told.
export const PRIMARY_DATE_PAST_DAYS = 365;
export const PRIMARY_DATE_FUTURE_DAYS = 10;

/** Days between two YYYY-MM-DD dates (b - a). @param {string} a @param {string} b */
function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** @param {unknown} value @returns {string | null} YYYY-MM-DD or null */
function dateOnly(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Whether a saved film is worth a release-dates lookup today. A row with no
 * usable date is looked up anyway: older saves have none, and skipping them
 * would mean never alerting for them.
 *
 * @param {unknown} primaryDate list_items.release_date
 * @param {string} today YYYY-MM-DD
 */
export function worthChecking(primaryDate, today) {
  const date = dateOnly(primaryDate);
  if (!date) return true;
  const d = dayDiff(today, date);
  return d >= -PRIMARY_DATE_PAST_DAYS && d <= PRIMARY_DATE_FUTURE_DAYS;
}

/**
 * One notification per person per film, shared with the people alerts on
 * purpose. It is the key premium-alerts writes for a followed person's film
 * (personReleaseKey), so if the person already has an alert for this film, from
 * either job and in either order, the unique (user_id, dedupe_key) index keeps
 * the first and the second is dropped. Without this a film that is both on your
 * list and by someone you follow would notify twice.
 *
 * @param {number} tmdbId
 */
export const movieReleaseKey = (tmdbId) => `person_release:movie:${tmdbId}`;

/**
 * Why a person who has the film saved is not told, or null if they are.
 *
 *   added_on_or_after — they saved it on or after the release date. Adding a
 *     film because it just came out is the common case, and "it's out" the
 *     next morning is an echo. A null saved-at counts as long before, so an
 *     old row is never silently dropped.
 *   watched — they have already logged watching it.
 *
 * @param {{ savedAt: string | null, watched: boolean }} person
 * @param {{ date: string }} release
 * @returns {'added_on_or_after' | 'watched' | null}
 */
export function skipReason(person, release) {
  if (person.watched) return 'watched';
  const saved = dateOnly(person.savedAt);
  if (saved && saved >= release.date) return 'added_on_or_after';
  return null;
}

/**
 * Every region where the film's first general release falls in the window.
 * The job uses this to skip the great majority of films before it reads a
 * single profile: a film with no region in range notifies nobody.
 *
 * @param {any} releaseDates /movie/{id}/release_dates body
 * @param {string} today YYYY-MM-DD
 * @param {string} since YYYY-MM-DD, inclusive
 * @returns {Record<string, { kind: 'theatrical' | 'digital', date: string }>}
 */
export function regionsInWindow(releaseDates, today, since) {
  /** @type {Record<string, { kind: 'theatrical' | 'digital', date: string }>} */
  const out = {};
  for (const [region, release] of Object.entries(regionalReleases(releaseDates))) {
    if (release.date >= since && release.date <= today) out[region] = release;
  }
  return out;
}

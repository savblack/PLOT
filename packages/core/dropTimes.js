// Exact episode drop times on screen (phase 2 of docs/features/episode-drop-times.md).
//
// The episode-air-times job stores TVmaze's exact times in episode_airings. This
// module reads them and puts the time on calendar events and the Episode alerts
// card, in the viewer's own clock. Web and mobile both call it.
//
// Only exact times are shown. Streaming services have no reliable source (TVmaze
// listed no time for 215 Netflix episodes in three weeks), so they keep showing
// the day; Savannah chose that on 2026-11-19 over hand-kept estimates.
//
// TVmaze and TMDB number episodes their own way, and the stored row is keyed by
// TVmaze's numbers. A time is only trusted when the stored row's date and TMDB's
// date for the same season and episode agree within a day; otherwise it is
// probably a different episode and the day is shown instead.

import { supabase } from './supabase.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// PostgREST puts .in() lists in the URL, so keep each one short.
const ID_CHUNK = 150;

/**
 * @typedef {{
 *   tmdb_id: number, season_number: number, episode_number: number,
 *   air_date: string, airs_at: string | null, time_source: string,
 * }} EpisodeAiring
 */

/** `${tmdbId}:${season}:${episode}` */
export function airingKey(tmdbId, season, episode) {
  return `${tmdbId}:${season}:${episode}`;
}

/**
 * The exact drop instant for one TMDB episode, or null when there is no
 * trustworthy one.
 *
 * @param {Map<string, EpisodeAiring>} airings keyed by airingKey
 * @param {number} tmdbId
 * @param {{ season_number?: number, episode_number?: number, air_date?: string | null }} episode TMDB episode
 * @returns {string | null} ISO instant
 */
export function exactDropFor(airings, tmdbId, episode) {
  const season = episode?.season_number;
  const number = episode?.episode_number;
  if (!Number.isInteger(season) || !Number.isInteger(number)) return null;
  const airing = airings.get(airingKey(tmdbId, season, number));
  if (!airing || airing.time_source !== 'exact' || !airing.airs_at) return null;
  if (typeof episode.air_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(episode.air_date)) return null;
  // Same episode only if both sources date it within a day of each other.
  const apart = Math.abs(Date.parse(`${airing.air_date}T00:00:00Z`) - Date.parse(`${episode.air_date}T00:00:00Z`));
  if (!(apart <= DAY_MS)) return null;
  return Number.isNaN(Date.parse(airing.airs_at)) ? null : airing.airs_at;
}

/**
 * An instant as the viewer's local date and clock time ("9:00 PM").
 *
 * @param {string} iso
 * @param {string} [timeZone] defaults to the device's zone
 * @returns {{ date: string, time: string }}
 */
export function localDrop(iso, timeZone) {
  const d = new Date(iso);
  const zone = timeZone ? { timeZone } : {};
  const date = d.toLocaleDateString('en-CA', zone);
  const time = d.toLocaleTimeString('en-US', { ...zone, hour: 'numeric', minute: '2-digit' });
  return { date, time };
}

/**
 * Puts exact drop times on built calendar events (from buildCalendarEvents).
 * A matched episode event gets `item.air_time` (shown on the row's meta line,
 * "ABC · 9:00 PM"), `drops_at`, and moves to the viewer's local date when the
 * drop falls on another day where they are. Returns a new, date-sorted array;
 * the input is not changed.
 *
 * @param {any[]} events
 * @param {Map<string, EpisodeAiring>} airings
 * @param {{ timeZone?: string, todayStr?: string }} [options] todayStr drops events now in the past
 * @returns {any[]}
 */
export function applyDropTimes(events, airings, { timeZone, todayStr } = {}) {
  if (!airings?.size) return events;
  const out = [];
  for (const ev of events) {
    const tmdbId = ev?.item?.tmdb_id;
    const drop = ev?.type === 'episode' && tmdbId ? exactDropFor(airings, tmdbId, ev.item.episode) : null;
    if (!drop) { out.push(ev); continue; }
    const { date, time } = localDrop(drop, timeZone);
    if (todayStr && date < todayStr) continue;
    out.push({ ...ev, date, drops_at: drop, item: { ...ev.item, air_time: time } });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Stored airings for these shows that are still ahead (or dropped in the last
 * day), keyed by airingKey. Errors resolve to an empty map: a missing time must
 * never break the calendar, which falls back to the day.
 *
 * @param {number[]} tmdbIds
 * @param {{ client?: any, now?: Date }} [options]
 * @returns {Promise<Map<string, EpisodeAiring>>}
 */
export async function fetchEpisodeAirings(tmdbIds, { client = supabase, now = new Date() } = {}) {
  const ids = [...new Set((tmdbIds ?? []).filter(id => Number.isInteger(id) && id > 0))];
  const out = new Map();
  if (!ids.length) return out;
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  try {
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { data, error } = await client.from('episode_airings')
        .select('tmdb_id, season_number, episode_number, air_date, airs_at, time_source')
        .in('tmdb_id', ids.slice(i, i + ID_CHUNK))
        .eq('time_source', 'exact')
        .gte('airs_at', since);
      if (error) return new Map();
      for (const row of data ?? []) out.set(airingKey(row.tmdb_id, row.season_number, row.episode_number), row);
    }
  } catch {
    return new Map();
  }
  return out;
}

/**
 * Calendar events with exact drop times added where known. The one call both
 * calendars make after buildCalendarEvents.
 *
 * @param {any[]} events
 * @param {{ timeZone?: string, todayStr?: string, client?: any }} [options]
 */
export async function withDropTimes(events, options = {}) {
  const ids = events.filter(ev => ev?.type === 'episode').map(ev => ev.item?.tmdb_id);
  if (!ids.length) return events;
  const airings = await fetchEpisodeAirings(ids, { client: options.client });
  return applyDropTimes(events, airings, options);
}

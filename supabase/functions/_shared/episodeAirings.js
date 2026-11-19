// Rules for episode-air-times: turning TVmaze shows and episodes into the
// episode_airings rows Plot reads exact drop times from. Pure, so it is unit
// tested (apps/web/tests/unit/episodeAirings.test.js) and the Edge Function only
// does I/O.
//
// The one rule that matters most: TVmaze only knows a time when `airtime` is
// filled in. With a blank airtime it still returns an `airstamp`, but that is a
// placeholder (Severance's episodes all read 12:00 UTC), not a time. So a blank
// airtime is stored as a date with no instant, never as a time.

/** Episodes this far back stay stored, so a time that moved after the drop is still visible. */
export const KEEP_PAST_DAYS = 7;
/** How far ahead to store. Later episodes rarely have a real time yet. */
export const KEEP_AHEAD_DAYS = 120;
/** A followed show is re-read at least this often even if TVmaze reports no change. */
export const RESYNC_AFTER_HOURS = 72;
/** A show TVmaze had no match for is looked up again after this long. */
export const RELINK_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar date, `days` from `from` (negative is earlier), as YYYY-MM-DD. */
export function isoDay(from, days = 0) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

/**
 * Which TVmaze lookup to try, in order, from TMDB's /tv/{id}/external_ids.
 * TheTVDB first: TVmaze records it for nearly every show and it names one show.
 * IMDb second. Never a title search, which is how two shows with one name get
 * mixed up.
 *
 * @param {{ tvdb_id?: number | null, imdb_id?: string | null } | null | undefined} ids
 * @returns {{ source: 'thetvdb' | 'imdb', value: string }[]}
 */
export function linkLookups(ids) {
  const out = [];
  if (Number.isInteger(ids?.tvdb_id) && ids.tvdb_id > 0) out.push({ source: 'thetvdb', value: String(ids.tvdb_id) });
  if (typeof ids?.imdb_id === 'string' && /^tt\d+$/.test(ids.imdb_id)) out.push({ source: 'imdb', value: ids.imdb_id });
  return out;
}

/**
 * Where a TVmaze show airs: a broadcast network (with its country and time zone)
 * or a streaming service. A streaming service with no country (Netflix, Apple
 * TV) is worldwide.
 *
 * @param {any} show TVmaze show
 * @returns {{ kind: 'network' | 'web' | null, name: string | null, country: string | null, timezone: string | null }}
 */
export function venueOf(show) {
  const network = show?.network;
  const web = show?.webChannel;
  const place = network ?? web ?? null;
  if (!place) return { kind: null, name: null, country: null, timezone: null };
  const country = place.country ?? null;
  return {
    kind: network ? 'network' : 'web',
    name: typeof place.name === 'string' ? place.name : null,
    country: typeof country?.code === 'string' ? country.code.toUpperCase() : null,
    timezone: typeof country?.timezone === 'string' ? country.timezone : null,
  };
}

/**
 * One TVmaze episode as an episode_airings row, or null when it is not one Plot
 * stores (a special, no number, no date, or outside the kept window).
 *
 * @param {any} ep TVmaze episode
 * @param {number} tmdbId
 * @param {Date} now
 */
export function airingRow(ep, tmdbId, now) {
  if (!ep || ep.type !== 'regular') return null;
  if (!Number.isInteger(ep.id) || !Number.isInteger(ep.season) || !Number.isInteger(ep.number)) return null;
  if (typeof ep.airdate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ep.airdate)) return null;
  if (ep.airdate < isoDay(now, -KEEP_PAST_DAYS) || ep.airdate > isoDay(now, KEEP_AHEAD_DAYS)) return null;

  const airtime = typeof ep.airtime === 'string' && /^\d{2}:\d{2}$/.test(ep.airtime) ? ep.airtime : null;
  const stamp = airtime && typeof ep.airstamp === 'string' ? Date.parse(ep.airstamp) : NaN;
  const exact = airtime !== null && !Number.isNaN(stamp);
  return {
    tmdb_id: tmdbId,
    season_number: ep.season,
    episode_number: ep.number,
    tvmaze_episode_id: ep.id,
    air_date: ep.airdate,
    air_time: exact ? airtime : null,
    airs_at: exact ? new Date(stamp).toISOString() : null,
    time_source: exact ? 'exact' : 'date',
    runtime_minutes: Number.isInteger(ep.runtime) && ep.runtime > 0 ? ep.runtime : null,
  };
}

/**
 * Two rows for one episode number in one show (TVmaze occasionally lists a
 * duplicate) would make the upsert fail. Keep the one with a time, then the
 * earliest TVmaze id.
 */
export function dedupeRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.season_number}:${row.episode_number}`;
    const prev = byKey.get(key);
    if (!prev
      || (prev.time_source !== 'exact' && row.time_source === 'exact')
      || (prev.time_source === row.time_source && row.tvmaze_episode_id < prev.tvmaze_episode_id)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

/**
 * Carries change tracking onto incoming rows. A drop time that moves is the
 * signal the alert brake watches, so the old value and when it moved are kept.
 * A first sighting is not a change.
 *
 * @param {any[]} incoming rows from airingRow
 * @param {Map<string, { air_date: string, airs_at: string | null }>} existing keyed `${season}:${episode}`
 * @param {Date} now
 */
export function withChanges(incoming, existing, now) {
  // Every row carries all three change columns. A batch upsert writes the union
  // of its rows' keys and nulls any a row lacks, so leaving them off unchanged
  // rows would wipe their last recorded move whenever a sibling moved.
  return incoming.map(row => {
    const prev = existing.get(`${row.season_number}:${row.episode_number}`);
    if (!prev) return { ...row, previous_air_date: null, previous_airs_at: null, changed_at: null };
    // Compare instants, not strings: Postgres hands back "+00:00" where the
    // row carries "Z".
    const before = prev.airs_at ? Date.parse(prev.airs_at) : null;
    const after = row.airs_at ? Date.parse(row.airs_at) : null;
    if (prev.air_date === row.air_date && before === after) {
      return {
        ...row,
        previous_air_date: prev.previous_air_date ?? null,
        previous_airs_at: prev.previous_airs_at ?? null,
        changed_at: prev.changed_at ?? null,
      };
    }
    return {
      ...row,
      previous_air_date: prev.air_date,
      previous_airs_at: prev.airs_at ?? null,
      changed_at: now.toISOString(),
    };
  });
}

/**
 * Stored episodes of a show that TVmaze no longer lists with a usable date in
 * the kept window: pulled to TBA, pushed past KEEP_AHEAD_DAYS, renumbered or
 * deleted. Their stored time will not happen, so they are removed rather than
 * left for a later alert to act on. Rows already past the window are removed too.
 *
 * @param {{ season_number: number, episode_number: number }[]} existing stored rows for the show
 * @param {{ season_number: number, episode_number: number }[]} fresh rows from airingRow
 * @returns {{ season_number: number, episode_number: number }[]}
 */
export function withdrawnRows(existing, fresh) {
  const keep = new Set(fresh.map(r => `${r.season_number}:${r.episode_number}`));
  return existing.filter(r => !keep.has(`${r.season_number}:${r.episode_number}`));
}

/**
 * Which linked shows to re-read this run, most urgent first:
 *  1. never synced;
 *  2. TVmaze says it changed since our last read;
 *  3. not read for RESYNC_AFTER_HOURS (in case an update was missed).
 * Everything else waits.
 *
 * @param {{ tmdb_id: number, tvmaze_id: number, synced_at: string | null, tvmaze_updated: number | null }[]} links
 * @param {Record<string, number>} updates TVmaze /updates/shows: tvmaze id -> unix seconds
 * @param {Date} now
 */
export function syncQueue(links, updates, now) {
  const stale = now.getTime() - RESYNC_AFTER_HOURS * 60 * 60 * 1000;
  const rank = (link) => {
    if (!link.synced_at) return 0;
    const changed = updates[String(link.tvmaze_id)];
    if (Number.isFinite(changed) && (link.tvmaze_updated == null || changed > link.tvmaze_updated)) return 1;
    if (Date.parse(link.synced_at) < stale) return 2;
    return null;
  };
  return links
    .map(link => ({ link, r: rank(link) }))
    .filter(x => x.r !== null)
    .sort((a, b) => a.r - b.r || (Date.parse(a.link.synced_at ?? 0) - Date.parse(b.link.synced_at ?? 0)))
    .map(x => x.link);
}

/**
 * Followed shows that need a TVmaze link: never looked up, or looked up with no
 * match more than RELINK_AFTER_DAYS ago (TVmaze adds shows over time).
 *
 * @param {number[]} followed TMDB ids
 * @param {Map<number, { tvmaze_id: number | null, checked_at: string }>} links
 * @param {Date} now
 */
export function linkQueue(followed, links, now) {
  const relinkBefore = now.getTime() - RELINK_AFTER_DAYS * DAY_MS;
  return followed.filter(id => {
    const link = links.get(id);
    if (!link) return true;
    return link.tvmaze_id === null && Date.parse(link.checked_at) < relinkBefore;
  });
}

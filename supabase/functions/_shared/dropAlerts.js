// Rules for episode-drop-alerts: telling followers an episode is out at the
// minute it drops, from the exact times in episode_airings. Pure, so they are
// unit-tested (apps/web/tests/unit/dropAlerts.test.js); the Edge Function only
// does I/O.
//
// The bar (docs/features/episode-drop-times.md, decision 3): an early or false
// alert costs more than a late one. So every rule here errs toward saying
// nothing and leaving the daily morning job to cover it.

/** A drop counts as "just happened" for this long, so missed runs heal. */
export const DUE_LOOK_BACK_HOURS = 6;
/** Brake: look at drops from an hour ago to this many hours ahead. */
export const BRAKE_AHEAD_HOURS = 6;
/** Brake: a time that moved within this many hours counts as moving. */
export const BRAKE_MOVED_HOURS = 24;
/** Brake: trip when more than this share of nearby drops moved... */
export const BRAKE_MOVED_SHARE = 0.1;
/** ...but only once there are enough of them for a share to mean anything. */
export const BRAKE_MIN_SAMPLE = 10;
/** Brake: trip when the time sync has not finished cleanly for this long. */
export const BRAKE_SYNC_STALE_HOURS = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Exact airings whose drop time is in (now - DUE_LOOK_BACK_HOURS, now], grouped
 * into drops: episodes of one show and season released at the same instant
 * with consecutive numbers are one drop, told as one row (episode_number is
 * the first, episode_count covers the rest), like the daily job does.
 *
 * @param {{ tmdb_id: number, season_number: number, episode_number: number,
 *   air_date: string, airs_at: string | null, time_source: string }[]} airings
 * @param {Date} now
 * @returns {{ tmdbId: number, season: number, firstEpisode: number, count: number,
 *   airsAt: string, airDate: string }[]}
 */
export function dueDrops(airings, now) {
  const until = now.getTime();
  const since = until - DUE_LOOK_BACK_HOURS * HOUR_MS;
  const groups = new Map();
  for (const a of airings) {
    if (a.time_source !== 'exact' || !a.airs_at) continue;
    const at = Date.parse(a.airs_at);
    if (!(at > since && at <= until)) continue;
    const key = `${a.tmdb_id}:${a.season_number}:${at}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const out = [];
  for (const rows of groups.values()) {
    rows.sort((x, y) => x.episode_number - y.episode_number);
    let run = [rows[0]];
    const flush = () => out.push({
      tmdbId: run[0].tmdb_id,
      season: run[0].season_number,
      firstEpisode: run[0].episode_number,
      count: run.length,
      airsAt: new Date(Date.parse(run[0].airs_at)).toISOString(),
      airDate: run[0].air_date,
    });
    for (const row of rows.slice(1)) {
      const last = run[run.length - 1];
      if (row.episode_number === last.episode_number) continue;
      if (row.episode_number === last.episode_number + 1) run.push(row);
      else { flush(); run = [row]; }
    }
    flush();
  }
  return out.sort((a, b) => a.airsAt.localeCompare(b.airsAt) || a.tmdbId - b.tmdbId);
}

/**
 * TMDB and TVmaze must agree this is the same episode before anyone is told:
 * TVmaze's numbers are not always TMDB's (year-numbered seasons, anime). Same
 * season and episode numbers, and dates within a day of each other.
 *
 * @param {{ air_date?: string | null } | null | undefined} tmdbEpisode TMDB's episode with these numbers
 * @param {{ airDate: string }} drop
 */
export function tmdbAgrees(tmdbEpisode, drop) {
  const date = tmdbEpisode?.air_date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const apart = Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${drop.airDate}T00:00:00Z`));
  return apart <= DAY_MS;
}

/**
 * The automatic brake (decision 12). Returns why alerts at the drop should
 * pause this run, or null to go ahead. When it trips, nothing is written: the
 * daily job tells people the next morning instead, and the run reports an
 * error so the hourly health check opens an incident.
 *
 *   times_moving — more than 10% of drops from an hour ago to six hours ahead
 *     had their time moved in the last day. Something upstream is reshuffling
 *     schedules, so a time Plot is about to act on may be wrong.
 *   sync_stale — the hourly time sync has not finished cleanly for three hours,
 *     so the stored times may be out of date.
 *
 * @param {{ airs_at: string | null, changed_at: string | null, time_source: string }[]} nearby
 * @param {string | null} lastSyncOkAt finished_at of the last ok episode-air-times run
 * @param {Date} now
 * @returns {'times_moving' | 'sync_stale' | null}
 */
export function brakeReason(nearby, lastSyncOkAt, now) {
  const t = now.getTime();
  if (!lastSyncOkAt || t - Date.parse(lastSyncOkAt) > BRAKE_SYNC_STALE_HOURS * HOUR_MS) return 'sync_stale';
  const from = t - HOUR_MS;
  const to = t + BRAKE_AHEAD_HOURS * HOUR_MS;
  const window = nearby.filter(a => {
    if (a.time_source !== 'exact' || !a.airs_at) return false;
    const at = Date.parse(a.airs_at);
    return at >= from && at <= to;
  });
  if (window.length < BRAKE_MIN_SAMPLE) return null;
  const moved = window.filter(a => a.changed_at && t - Date.parse(a.changed_at) <= BRAKE_MOVED_HOURS * HOUR_MS).length;
  return moved / window.length > BRAKE_MOVED_SHARE ? 'times_moving' : null;
}

/**
 * The kill switch (decision 12): the PostHog flag `kill-episode-drop-alerts`.
 * True only when PostHog answered and the flag is on. Any other answer (no
 * flag, an error, an odd body) is false: the switch can only take the feature
 * away, never break it, matching packages/core/killSwitches.js.
 *
 * @param {any} body a /flags?v=2 response
 */
export function dropAlertsKilled(body) {
  if (!body || typeof body !== 'object' || body.errorsWhileComputingFlags === true) return false;
  const flag = body.flags?.['kill-episode-drop-alerts'];
  if (flag && typeof flag === 'object') return flag.enabled === true;
  return body.featureFlags?.['kill-episode-drop-alerts'] === true;
}

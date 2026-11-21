// The Insights page: what your watching says about you, worked out from your
// own history rows (and, where named, the TMDB details for them). Pure
// functions, like historyStats.js: every date comes from a passed `now`, so
// the whole file is unit-testable and web and mobile get the same answers.
//
// Nothing here compares you with other Plot users. "The crowd" is TMDB's
// audience score, as on History (see historyStats.js for why).
//
// Free sees This month and This year; Premium adds All time and the deeper
// sections. Which is which lives in INSIGHT_PERIODS / FREE_PERIODS so both
// apps gate the same things.

import { calendarParts, recurringPeople } from './historyStats.js';
import { INSIGHTS_VIEW as T } from './copy/insightsView.js';

export const INSIGHT_PERIODS = Object.freeze({ MONTH: 'month', YEAR: 'year', ALL: 'all' });
/**
 * Periods a Free viewer can open. All time is Premium.
 * @type {ReadonlyArray<string>}
 */
export const FREE_PERIODS = Object.freeze([INSIGHT_PERIODS.MONTH, INSIGHT_PERIODS.YEAR]);

/** The window "Lately" looks at, in days, today included. */
export const LATELY_DAYS = 30;
/** Fewer titles than this in the window and Lately says nothing rather than guess. */
export const LATELY_MIN_TITLES = 3;
/** "Your usual" needs this many titles in the year before the window. */
export const USUAL_MIN_TITLES = 10;
/** A hot take is a title you rated at least this many stars away from the crowd. */
export const HOT_TAKE_STARS = 1;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Calendar day number (days since 1970-01-01) of a "YYYY-MM-DD…" string, or null. */
function dayNumber(dateStr) {
  const p = calendarParts(dateStr);
  return p ? Date.UTC(p.year, p.month, p.day) / 86400000 : null;
}

/** Today's calendar day number in the viewer's local time. */
function todayNumber(now) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
}

/** Entries whose watch date falls in [from, to], both day numbers, inclusive. */
function between(entries, from, to) {
  return entries.filter(e => {
    const d = dayNumber(e.watched_at);
    return d != null && d >= from && d <= to;
  });
}

const isShow = (e) => (e.media_type || 'movie') === 'tv';

/**
 * The entries a period covers, up to and including today.
 * @param {any[]} entries
 * @param {'month' | 'year' | 'all'} period
 * @param {Date} [now]
 */
export function periodEntries(entries, period, now = new Date()) {
  const today = todayNumber(now);
  if (period === INSIGHT_PERIODS.ALL) return between(entries, -Infinity, today);
  const start = period === INSIGHT_PERIODS.MONTH
    ? Date.UTC(now.getFullYear(), now.getMonth(), 1) / 86400000
    : Date.UTC(now.getFullYear(), 0, 1) / 86400000;
  return between(entries, start, today);
}

/**
 * The same stretch a year earlier: last year's January 1 (or the first of this
 * month, last year) up to last year's today. A fair comparison mid-year,
 * where "all of last year" would always look bigger. Null for All time.
 * @param {any[]} entries
 * @param {'month' | 'year' | 'all'} period
 * @param {Date} [now]
 */
export function samePeriodLastYear(entries, period, now = new Date()) {
  if (period === INSIGHT_PERIODS.ALL) return null;
  const y = now.getFullYear() - 1;
  const start = period === INSIGHT_PERIODS.MONTH
    ? Date.UTC(y, now.getMonth(), 1) / 86400000
    : Date.UTC(y, 0, 1) / 86400000;
  // Feb 29 has no last-year twin: Date.UTC rolls it to Mar 1, one day long.
  const end = Date.UTC(y, now.getMonth(), now.getDate()) / 86400000;
  return between(entries, start, end);
}

/**
 * How many titles and the average rating, now against the same stretch last
 * year. Null when last year has nothing to compare with.
 * @param {any[]} current @param {any[] | null} previous
 * @returns {{ titles: number, stars: number | null } | null} Differences, current minus previous.
 */
export function yearOverYear(current, previous) {
  if (!previous || !previous.length) return null;
  const avg = (rows) => {
    const r = rows.map(e => e.rating).filter(x => x > 0);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length / 2 : null;
  };
  const a = avg(current), b = avg(previous);
  return {
    titles: current.length - previous.length,
    stars: a != null && b != null ? Math.round((a - b) * 10) / 10 : null,
  };
}

/**
 * The plain facts behind the Lately card: the last LATELY_DAYS days.
 * @param {any[]} entries
 * @param {{ now?: Date, genreName?: (id: number) => string | null }} [opts]
 * @returns {null | {
 *   count: number,
 *   genre: { id: number, name: string, share: number } | null,
 *   showShare: number,
 *   weekendShare: number,
 *   weekday: { name: string, share: number } | null,
 * }}
 */
export function latelyFacts(entries, { now = new Date(), genreName = () => null } = {}) {
  const today = todayNumber(now);
  const recent = between(entries, today - LATELY_DAYS + 1, today);
  return facts(recent, genreName, LATELY_MIN_TITLES);
}

function facts(rows, genreName, min) {
  if (rows.length < min) return null;
  const n = rows.length;
  const genres = new Map();
  for (const e of rows) for (const id of e.genre_ids || []) genres.set(id, (genres.get(id) || 0) + 1);
  // Most common named genre; ties go to the lower id so the answer is stable.
  const top = [...genres.entries()]
    .filter(([id]) => genreName(id))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const days = new Array(7).fill(0);
  for (const e of rows) { const p = calendarParts(e.watched_at); if (p) days[p.weekday]++; }
  const topDay = days.indexOf(Math.max(...days));
  return {
    count: n,
    genre: top ? { id: top[0], name: genreName(top[0]), share: top[1] / n } : null,
    showShare: rows.filter(isShow).length / n,
    // Friday night counts as the weekend: it's when most people start one.
    weekendShare: (days[5] + days[6] + days[0]) / n,
    weekday: days[topDay] ? { name: WEEKDAYS[topDay], share: days[topDay] / n } : null,
  };
}

/**
 * "Mostly comedy, mostly on weekends, and more shows than movies."
 * @param {ReturnType<typeof latelyFacts>} f
 */
export function latelySentence(f) {
  if (!f) return null;
  const parts = [];
  if (f.genre && f.genre.share >= 0.4) parts.push(T.latelyMostly(f.genre.name));
  else if (f.genre && f.genre.share >= 0.25) parts.push(T.latelyALotOf(f.genre.name));
  else parts.push(T.latelyMixOfGenres);
  if (f.count >= 4) {
    if (f.weekendShare >= 0.6) parts.push(T.latelyWeekends);
    else if (f.weekendShare <= 0.2) parts.push(T.latelyWeeknights);
    else if (f.weekday && f.weekday.share >= 0.4) parts.push(T.latelyOnDay(f.weekday.name));
  }
  if (f.showShare >= 0.65) parts.push(T.latelyMoreShows);
  else if (f.showShare <= 0.35) parts.push(T.latelyMoreMovies);
  else parts.push(T.latelyEvenMix);
  const text = parts.length > 2
    ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
    : parts.join(' and ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

/**
 * Premium: how the last LATELY_DAYS days differ from your usual (the 365
 * days before them). Each line is true of the data; an empty list means
 * nothing moved enough to mention. Null when there isn't enough of either.
 * @param {any[]} entries
 * @param {{ now?: Date, genreName?: (id: number) => string | null }} [opts]
 * @returns {string[] | null}
 */
export function latelyShifts(entries, { now = new Date(), genreName = () => null } = {}) {
  const today = todayNumber(now);
  const windowStart = today - LATELY_DAYS + 1;
  const recentRows = between(entries, windowStart, today);
  const usualRows = between(entries, windowStart - 365, windowStart - 1);
  const recent = facts(recentRows, genreName, LATELY_MIN_TITLES);
  const usual = facts(usualRows, genreName, USUAL_MIN_TITLES);
  if (!recent || !usual) return null;

  const lines = [];
  const shareOf = (rows, id) => rows.filter(e => (e.genre_ids || []).includes(id)).length / rows.length;
  if (recent.genre) {
    const before = shareOf(usualRows, recent.genre.id);
    if (recent.genre.share - before >= 0.15) lines.push(T.shiftMoreGenre(recent.genre.name));
  }
  if (usual.genre && usual.genre.id !== recent.genre?.id) {
    const now_ = shareOf(recentRows, usual.genre.id);
    if (usual.genre.share - now_ >= 0.15) lines.push(T.shiftLessGenre(usual.genre.name));
  }
  if (recent.showShare - usual.showShare >= 0.2) lines.push(T.shiftMoreShows);
  else if (usual.showShare - recent.showShare >= 0.2) lines.push(T.shiftMoreMovies);
  const perWeekRecent = recentRows.length / (LATELY_DAYS / 7);
  const perWeekUsual = usualRows.length / (365 / 7);
  if (perWeekUsual > 0 && perWeekRecent / perWeekUsual >= 1.5) lines.push(T.shiftMorePace(perWeekRecent, perWeekUsual));
  else if (perWeekUsual > 0 && perWeekRecent / perWeekUsual <= 0.5) lines.push(T.shiftLessPace(perWeekRecent, perWeekUsual));
  return lines;
}

/** One row per title: rewatches collapse to the highest rating, earliest watch. */
function bestPerTitle(rows) {
  const by = new Map();
  for (const e of rows) {
    if (!(e.rating > 0)) continue;
    const key = `${e.media_type || 'movie'}:${e.tmdb_id}`;
    const cur = by.get(key);
    if (!cur || e.rating > cur.rating
      || (e.rating === cur.rating && (dayNumber(e.watched_at) ?? Infinity) < (dayNumber(cur.watched_at) ?? Infinity))) {
      by.set(key, e);
    }
  }
  return [...by.entries()]
    .sort(([ka, a], [kb, b]) => b.rating - a.rating
      || (dayNumber(a.watched_at) ?? Infinity) - (dayNumber(b.watched_at) ?? Infinity)
      || (a.title || '').localeCompare(b.title || '')
      || ka.localeCompare(kb));
}

/**
 * Your highest-rated titles in the period, and how each moved since 30 days
 * ago. Not your Top 5 lists (those are picked by hand): this is ranked by
 * rating, so it changes as you rate. Ties keep the title that got there first.
 *
 * `moves` is false when the period is too young for a "30 days ago" to mean
 * anything (This month, or a year that began less than 30 days ago).
 * @param {any[]} entries The period's entries.
 * @param {{ now?: Date, limit?: number, periodStart?: string | null }} [opts]
 *   periodStart: "YYYY-MM-DD" the period began, or null for All time.
 * @returns {{ moves: boolean, items: Array<{ entry: any, rank: number, move: 'new' | 'up' | 'down' | 'same' | null, by: number }> }}
 */
export function highestRated(entries, { now = new Date(), limit = 5, periodStart = null } = {}) {
  const today = todayNumber(now);
  const cutoff = today - LATELY_DAYS;
  const start = periodStart ? dayNumber(periodStart) : -Infinity;
  const ranked = bestPerTitle(entries).slice(0, limit);
  const moves = start <= cutoff && between(entries, start, cutoff).some(e => e.rating > 0);
  const before = moves ? bestPerTitle(between(entries, start, cutoff)).slice(0, limit).map(([k]) => k) : [];
  return {
    moves,
    items: ranked.map(([key, entry], i) => {
      if (!moves) return { entry, rank: i + 1, move: null, by: 0 };
      const was = before.indexOf(key);
      if (was < 0) return { entry, rank: i + 1, move: 'new', by: 0 };
      const by = was - i;
      return { entry, rank: i + 1, move: by > 0 ? 'up' : by < 0 ? 'down' : 'same', by: Math.abs(by) };
    }),
  };
}

/**
 * What you watched on today's date in earlier years, newest year first.
 * On Feb 28 of a common year, Feb 29 entries count too, so they still
 * come round.
 * @param {any[]} entries
 * @param {Date} [now]
 * @returns {Array<{ year: number, yearsAgo: number, entries: any[] }>}
 */
export function onThisDay(entries, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const leap = (yr) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  const alsoLeapDay = m === 1 && d === 28 && !leap(y);
  const years = new Map();
  for (const e of entries) {
    const p = calendarParts(e.watched_at);
    if (!p || p.year >= y || p.month !== m) continue;
    if (p.day !== d && !(alsoLeapDay && p.day === 29)) continue;
    if (!years.has(p.year)) years.set(p.year, []);
    years.get(p.year).push(e);
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => ({ year, yearsAgo: y - year, entries: rows }));
}

/** Titles per weekday, Sunday first. Day of week only: many rows carry a date and no time. */
export function weekdayCounts(entries) {
  const days = new Array(7).fill(0);
  for (const e of entries) { const p = calendarParts(e.watched_at); if (p) days[p.weekday]++; }
  return days;
}

/**
 * Titles you rated at least HOT_TAKE_STARS away from TMDB's audience,
 * furthest first.
 * @param {any[]} entries @param {Map<string, any>} details
 * @param {{ limit?: number }} [opts]
 * @returns {Array<{ entry: any, deltaStars: number, crowdStars: number }>}
 */
export function hotTakes(entries, details, { limit = 5 } = {}) {
  const rows = [];
  for (const e of entries) {
    if (!(e.rating > 0)) continue;
    const vote = details.get(`${e.media_type || 'movie'}:${e.tmdb_id}`)?.vote_average;
    if (!(vote > 0)) continue;
    const deltaStars = (e.rating - vote) / 2;
    if (Math.abs(deltaStars) >= HOT_TAKE_STARS) rows.push({ entry: e, deltaStars, crowdStars: Math.round(vote * 5) / 10 });
  }
  return rows.sort((a, b) => Math.abs(b.deltaStars) - Math.abs(a.deltaStars)).slice(0, limit);
}

/**
 * The teaser lines on a Free viewer's locked rows. Each is worked out from the
 * viewer's own data, so it's true; a row whose fact isn't there is left out
 * rather than padded with a generic pitch.
 * @param {{ entries: any[], periodRows: any[], details: Map<string, any>, now?: Date, genreName?: (id: number) => string | null, period: string }} a
 * @returns {Array<{ id: string, title: string, teaser: string }>}
 */
export function premiumTeasers({ entries, periodRows, details, now = new Date(), genreName = () => null, period }) {
  const out = [];
  const shifts = latelyShifts(entries, { now, genreName });
  if (shifts && shifts.length) out.push({ id: 'usual', title: T.usualHeading, teaser: T.teaseUsual(shifts.length) });
  const takes = hotTakes(periodRows, details, { limit: 50 });
  if (takes.length) out.push({ id: 'hotTakes', title: T.hotTakesHeading, teaser: T.teaseHotTakes(takes.length) });
  const last = samePeriodLastYear(entries, period, now);
  if (last && last.length) out.push({ id: 'lastYear', title: T.lastYearHeading, teaser: T.teaseLastYear(now.getFullYear() - 1) });
  const people = recurringPeople(periodRows, details, { limit: 50 });
  if (people.length > 3) out.push({ id: 'people', title: T.morePeopleHeading, teaser: T.teaseMorePeople(people.length - 3) });
  if (periodRows.length >= 7) out.push({ id: 'weekdays', title: T.weekdaysHeading, teaser: T.teaseWeekdays });
  const all = periodEntries(entries, INSIGHT_PERIODS.ALL, now);
  const first = Math.min(...all.map(e => calendarParts(e.watched_at)?.year ?? Infinity));
  if (Number.isFinite(first) && first < now.getFullYear()) {
    out.push({ id: 'allTime', title: T.periods.all, teaser: T.teaseAllTime(all.length, first) });
  }
  return out;
}

/**
 * Properties for EVENTS.INSIGHTS_OPENED, the same shape from both apps.
 * @param {{ premium: boolean, source: 'web' | 'mobile' }} a
 */
export function insightsOpenedProps({ premium, source }) {
  return { premium: !!premium, source };
}

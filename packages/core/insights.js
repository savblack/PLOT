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

import { calendarParts } from './historyStats.js';
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
 * Properties for EVENTS.INSIGHTS_OPENED, the same shape from both apps.
 * @param {{ premium: boolean, source: 'web' | 'mobile' }} a
 */
export function insightsOpenedProps({ premium, source }) {
  return { premium: !!premium, source };
}

// ── Watching type ─────────────────────────────────────────────────────────
// A name for how you've been watching ("The Binger", "The Horror Devotee"),
// picked by plain rules over your own history and always shown with the facts
// that earned it, so it reads as a reflection of your habits rather than a
// horoscope. Looks at the last 30 days when there's enough there, else the
// year so far. Order matters only for ties: the first listed wins.

/** Titles a window needs before it gets a type. */
export const TYPE_MIN_TITLES = 5;

export const WATCHING_TYPES = Object.freeze([
  'binger', 'devotee', 'critic', 'champion', 'rewatcher', 'weekender', 'editor', 'filmBuff', 'explorer', 'allRounder',
]);

/** How far each rule's measure is past its line (1 = just over). */
function typeScores(s) {
  const scores = {};
  if (s.showShare >= 0.6 && s.perWeek >= 3) scores.binger = (s.showShare / 0.6 + s.perWeek / 3) / 2;
  if (s.genre && s.genre.share >= 0.5) scores.devotee = s.genre.share / 0.5;
  if (s.crowd != null && s.crowd <= -0.5) scores.critic = -s.crowd / 0.5;
  if (s.crowd != null && s.crowd >= 0.5) scores.champion = s.crowd / 0.5;
  if (s.rewatchShare >= 0.25) scores.rewatcher = s.rewatchShare / 0.25;
  if (s.weekendShare >= 0.7) scores.weekender = s.weekendShare / 0.7;
  if (s.dnfShare >= 0.2) scores.editor = s.dnfShare / 0.2;
  if (s.showShare <= 0.2) scores.filmBuff = (1 - s.showShare) / 0.8;
  if (s.genre && s.genre.share < 0.3 && s.genres >= 6) scores.explorer = s.genres / 6;
  return scores;
}

function windowStats(rows, all, details, genreName) {
  const f = facts(rows, genreName, 1);
  const days = new Set(rows.map(e => dayNumber(e.watched_at)).filter(d => d != null));
  const span = days.size ? Math.max(7, Math.max(...days) - Math.min(...days) + 1) : 7;
  const firstSeen = new Map();
  for (const e of all) {
    const k = `${e.media_type || 'movie'}:${e.tmdb_id}`;
    const d = dayNumber(e.watched_at);
    if (d != null && (!firstSeen.has(k) || d < firstSeen.get(k))) firstSeen.set(k, d);
  }
  const rewatches = rows.filter(e => {
    const d = dayNumber(e.watched_at);
    return d != null && firstSeen.get(`${e.media_type || 'movie'}:${e.tmdb_id}`) < d;
  }).length;
  const deltas = [];
  for (const e of rows) {
    const vote = details?.get(`${e.media_type || 'movie'}:${e.tmdb_id}`)?.vote_average;
    if (e.rating > 0 && vote > 0) deltas.push((e.rating - vote) / 2);
  }
  const genreIds = new Set(rows.flatMap(e => (e.genre_ids || []).filter(id => genreName(id))));
  return {
    count: rows.length,
    showShare: f.showShare,
    weekendShare: f.weekendShare,
    weekday: f.weekday,
    genre: f.genre,
    genres: genreIds.size,
    perWeek: rows.length / (span / 7),
    rewatches,
    rewatchShare: rewatches / rows.length,
    dnf: rows.filter(e => e.dnf).length,
    dnfShare: rows.filter(e => e.dnf).length / rows.length,
    crowd: deltas.length >= 3 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
  };
}

/** The type for one window of rows, or null below TYPE_MIN_TITLES. */
function typeFor(rows, all, details, genreName) {
  if (rows.length < TYPE_MIN_TITLES) return null;
  const s = windowStats(rows, all, details, genreName);
  const scores = typeScores(s);
  let id = 'allRounder', best = 0;
  for (const t of WATCHING_TYPES) if ((scores[t] ?? 0) > best) { best = scores[t]; id = t; }
  return { id, s };
}

/** The facts behind a type, its own fact first. Every line is true of the window. */
function typeReasons(id, s) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const all = {
    binger: s.showShare >= 0.5 ? T.reasonShows(pct(s.showShare)) : null,
    pace: s.perWeek >= 2 ? T.reasonPace(Math.round(s.perWeek * 10) / 10) : null,
    devotee: s.genre && s.genre.share >= 0.3 ? T.reasonGenre(s.genre.name, pct(s.genre.share)) : null,
    critic: s.crowd != null && s.crowd <= -0.25 ? T.reasonTougher(Math.abs(Math.round(s.crowd * 10) / 10)) : null,
    champion: s.crowd != null && s.crowd >= 0.25 ? T.reasonKinder(Math.round(s.crowd * 10) / 10) : null,
    rewatcher: s.rewatches ? T.reasonRewatches(s.rewatches) : null,
    weekender: s.weekendShare >= 0.5 ? T.reasonWeekends(pct(s.weekendShare)) : null,
    editor: s.dnf ? T.reasonDnf(s.dnf) : null,
    filmBuff: s.showShare <= 0.3 ? T.reasonMovies(pct(1 - s.showShare)) : null,
    explorer: s.genres >= 4 ? T.reasonGenres(s.genres) : null,
  };
  const own = { binger: 'binger', devotee: 'devotee', critic: 'critic', champion: 'champion', rewatcher: 'rewatcher', weekender: 'weekender', editor: 'editor', filmBuff: 'filmBuff', explorer: 'explorer', allRounder: null }[id];
  const order = [own, 'pace', 'devotee', 'binger', 'filmBuff', 'weekender', 'critic', 'champion', 'rewatcher', 'editor', 'explorer'];
  const out = [];
  for (const k of order) if (k && all[k] && !out.includes(all[k])) out.push(all[k]);
  return out.slice(0, 3);
}

/**
 * How you've been watching, as a named type with the facts behind it.
 * @param {any[]} entries Every history row.
 * @param {{ now?: Date, details?: Map<string, any>, genreName?: (id: number) => string | null }} [opts]
 * @returns {null | { id: string, name: string, line: string, reasons: string[], basis: 'lately' | 'year', count: number }}
 */
export function watchingType(entries, { now = new Date(), details = new Map(), genreName = () => null } = {}) {
  const today = todayNumber(now);
  const lately = between(entries, today - LATELY_DAYS + 1, today);
  const year = between(entries, Date.UTC(now.getFullYear(), 0, 1) / 86400000, today);
  const basis = lately.length >= TYPE_MIN_TITLES ? 'lately' : 'year';
  const t = typeFor(basis === 'lately' ? lately : year, entries, details, genreName);
  if (!t) return null;
  return { id: t.id, name: T.typeName(t.id, t.s.genre?.name), line: T.typeLine[t.id], reasons: typeReasons(t.id, t.s), basis, count: t.s.count };
}

/**
 * Your type in each of the last `months` calendar months (this one included),
 * newest first. A month with too little logged has `name: null`.
 * @param {any[]} entries
 * @param {{ now?: Date, months?: number, details?: Map<string, any>, genreName?: (id: number) => string | null }} [opts]
 * @returns {Array<{ year: number, month: number, id: string | null, name: string | null }>}
 */
export function typeHistory(entries, { now = new Date(), months = 6, details = new Map(), genreName = () => null } = {}) {
  const out = [];
  for (let i = 0; i < months; i++) {
    const y = now.getFullYear(), m = now.getMonth() - i;
    const start = Date.UTC(y, m, 1) / 86400000;
    const end = Math.min(Date.UTC(y, m + 1, 0) / 86400000, todayNumber(now));
    const first = new Date(Date.UTC(y, m, 1));
    const t = typeFor(between(entries, start, end), entries, details, genreName);
    out.push({ year: first.getUTCFullYear(), month: first.getUTCMonth(), id: t?.id ?? null, name: t ? T.typeName(t.id, t.s.genre?.name) : null });
  }
  return out;
}

// ── Sample insights ───────────────────────────────────────────────────────
// What a Free viewer's locked Premium cards, and an empty account's whole
// page, show instead of their own numbers. Every surface that draws these
// marks them as a sample. Titles are text only (no posters, no TMDB ids).
export const SAMPLE_INSIGHTS = Object.freeze({
  type: {
    id: 'devotee', name: 'The Horror Devotee', line: 'If it might make you sleep with the light on, you’re in.',
    reasons: ['Horror in 6 of 10 titles', '3.1 titles a week', '80% on weekends'], basis: 'lately', count: 10,
  },
  typeHistory: ['The Horror Devotee', 'The Binger', 'The Binger', 'The Weekend Watcher', 'The Film Buff', 'The All-Rounder'],
  stats: { titles: 142, movies: '4d 6h', night: 'Friday', stars: 3.6, titlesVsLastYear: 19, starsVsLastYear: 0.3 },
  highest: [
    { title: 'Past Lives', stars: 5, move: 'up', by: 2 },
    { title: 'Severance', stars: 5, move: 'new', by: 0 },
    { title: 'The Holdovers', stars: 5, move: null, by: 0 },
    { title: 'Conclave', stars: 4.5, move: 'down', by: 2 },
    { title: 'Flow', stars: 4.5, move: null, by: 0 },
  ],
  usual: ['More horror than usual', 'More shows than usual', 'Watching more than usual: 3.1 a week, usually 1.8'],
  hotTakes: [
    { title: 'Oppenheimer', you: 2.5, crowd: 4.1 },
    { title: 'Emily in Paris', you: 4, crowd: 2.4 },
    { title: 'Barbie', you: 2, crowd: 3.5 },
  ],
  weekdays: [3, 1, 1, 2, 2, 7, 6],
  people: [{ name: 'Florence Pugh', line: '4 titles this year' }, { name: 'Pedro Pascal', line: '3 titles this year' }],
});

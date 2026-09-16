// Insights over a user's watch history. Pure functions: every input is a
// history row (plus, optionally, the TMDB details for it) and every output is
// a number or a sentence. No fetching, no dates read from the clock unless a
// `now` is passed, so the whole file is unit-testable.
//
// Comparisons are always against TMDB's audience (vote_average), never other
// PLOT users: the user base is far too small for "people like you" to mean
// anything yet.

import { ratingToStars } from './ratings.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * "YYYY-MM-DD" → { year, month (0-based), day, weekday (0 = Sunday) }, read
 * straight off the string so a UTC-parsed date-only value never rolls into
 * the previous day in western timezones (see history.js for the long form).
 * @param {string | null | undefined} dateStr
 */
export function calendarParts(dateStr) {
  const m = typeof dateStr === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr) : null;
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]) - 1, day = Number(m[3]);
  // Date.UTC keeps weekday arithmetic timezone-free.
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return { year, month, day, weekday };
}

export const detailsKey = (entry) => `${entry.media_type || 'movie'}:${entry.tmdb_id}`;

/** @param {any[]} entries @param {number} year */
export function entriesInYear(entries, year) {
  return entries.filter(e => calendarParts(e.watched_at)?.year === year);
}

/** Years that have at least one entry, newest first. */
export function yearsWithEntries(entries) {
  const years = new Set();
  for (const e of entries) { const p = calendarParts(e.watched_at); if (p) years.add(p.year); }
  return [...years].sort((a, b) => b - a);
}

/**
 * @param {any[]} entries
 * @param {{ types?: string[], genres?: number[], reviewed?: boolean, dnf?: boolean, query?: string }} f
 *   Empty `types`/`genres` mean "no filter". `reviewed`/`dnf` are OR'd with
 *   each other when both are on (either state qualifies).
 */
export function filterEntries(entries, f = {}) {
  const types = f.types ?? [];
  const genres = f.genres ?? [];
  const q = (f.query ?? '').trim().toLowerCase();
  return entries.filter(e => {
    if (types.length && !types.includes(e.media_type || 'movie')) return false;
    if (genres.length && !(e.genre_ids || []).some(id => genres.includes(id))) return false;
    if (f.reviewed || f.dnf) {
      const ok = (f.reviewed && !!e.note) || (f.dnf && !!e.dnf);
      if (!ok) return false;
    }
    if (q && !(e.title || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Genre id → count across the entries, most common first. */
export function genreCounts(entries) {
  const counts = new Map();
  for (const e of entries) for (const id of e.genre_ids || []) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

/**
 * One title per day: the highest-rated entry that day, else the one logged
 * last. Keyed by day-of-month.
 * @returns {Map<number, any>}
 */
export function titlePerDay(entries, year, month) {
  const byDay = new Map();
  for (const e of entries) {
    const p = calendarParts(e.watched_at);
    if (!p || p.year !== year || p.month !== month) continue;
    const cur = byDay.get(p.day);
    if (!cur) { byDay.set(p.day, e); continue; }
    const better = (e.rating ?? -1) > (cur.rating ?? -1)
      || ((e.rating ?? -1) === (cur.rating ?? -1) && (e.created_at || '') > (cur.created_at || ''));
    if (better) byDay.set(p.day, e);
  }
  return byDay;
}

/** Distinct watch days as UTC day numbers, ascending. */
function dayNumbers(entries) {
  const days = new Set();
  for (const e of entries) {
    const p = calendarParts(e.watched_at);
    if (p) days.add(Date.UTC(p.year, p.month, p.day) / 86400000);
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * Longest run of consecutive watch days, and the run that ends today (or
 * yesterday, so a streak survives until the day is actually missed).
 * @param {any[]} entries
 * @param {Date} [now]
 */
export function streaks(entries, now = new Date()) {
  const days = dayNumbers(entries);
  let best = { length: 0, endDay: null }, run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > best.length) best = { length: run, endDay: days[i] };
  }
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
  let current = 0;
  if (days.length && (days[days.length - 1] === today || days[days.length - 1] === today - 1)) {
    current = 1;
    for (let i = days.length - 1; i > 0 && days[i] === days[i - 1] + 1; i--) current++;
  }
  const bestMonth = best.endDay == null ? null : MONTHS[new Date(best.endDay * 86400000).getUTCMonth()];
  return { best: best.length, bestMonth, current, watchDays: days.length };
}

/** Most common watch weekday: { name, count } or null. */
export function favouriteWeekday(entries) {
  const counts = new Array(7).fill(0);
  let total = 0;
  for (const e of entries) { const p = calendarParts(e.watched_at); if (p) { counts[p.weekday]++; total++; } }
  if (!total) return null;
  const top = counts.indexOf(Math.max(...counts));
  return { name: WEEKDAYS[top], count: counts[top], total };
}

/**
 * Minutes on screen, counting films only: a TV row is "a title", not a
 * number of episodes, and guessing a whole series would inflate it.
 * @param {any[]} entries @param {Map<string, any>} details
 */
export function movieMinutes(entries, details) {
  let total = 0, counted = 0;
  for (const e of entries) {
    if ((e.media_type || 'movie') !== 'movie') continue;
    const rt = details.get(detailsKey(e))?.runtime;
    if (rt > 0) { total += rt; counted++; }
  }
  return { minutes: total, counted };
}

/** 4d 6h / 6h 12m / 45m */
export function formatDuration(minutes) {
  if (!minutes) return '0m';
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Ratings are stored 0-10; shown as 5 stars. */
export function averageStars(entries) {
  const rated = entries.map(e => e.rating).filter(r => r != null && r > 0);
  const avg = mean(rated);
  return avg == null ? null : { stars: Math.round(ratingToStars(avg) * 10) / 10, count: rated.length };
}

/** Genre id → name lookups are the caller's; this gives the top id. */
export function topGenreId(entries) {
  return genreCounts(entries)[0]?.id ?? null;
}

/**
 * How the user rates against TMDB's audience, in stars. Positive = kinder.
 * @param {any[]} entries @param {Map<string, any>} details
 * @returns {{ deltaStars: number, compared: number, disagreements: Array<{ entry: any, deltaStars: number }> } | null}
 */
export function crowdComparison(entries, details) {
  const rows = [];
  for (const e of entries) {
    if (!(e.rating > 0)) continue;
    const vote = details.get(detailsKey(e))?.vote_average;
    if (!(vote > 0)) continue;
    rows.push({ entry: e, deltaStars: (e.rating - vote) / 2 });
  }
  if (!rows.length) return null;
  const deltaStars = mean(rows.map(r => r.deltaStars));
  const disagreements = [...rows].sort((a, b) => Math.abs(b.deltaStars) - Math.abs(a.deltaStars)).slice(0, 3);
  return { deltaStars, compared: rows.length, disagreements };
}

/** "Half a star kinder than the crowd, except about Emilia Pérez." */
export function crowdSentence(cmp) {
  if (!cmp) return null;
  const d = cmp.deltaStars;
  const worst = cmp.disagreements[0];
  const outlier = worst && Math.abs(worst.deltaStars) >= 1.5 ? worst.entry.title : null;
  if (Math.abs(d) < 0.15) return outlier ? `In step with the crowd, except about ${outlier}.` : 'In step with the crowd.';
  const amount = Math.abs(d) < 0.35 ? 'A quarter star' : Math.abs(d) < 0.75 ? 'Half a star' : Math.abs(d) < 1.25 ? 'A full star' : `${Math.abs(d).toFixed(1)} stars`;
  const dir = d > 0 ? 'kinder' : 'harsher';
  return outlier ? `${amount} ${dir} than the crowd, except about ${outlier}.` : `${amount} ${dir} than the crowd.`;
}

/**
 * People who turn up in the cast of more than one title this year.
 * @param {any[]} entries @param {Map<string, any>} details
 * @param {{ limit?: number, castDepth?: number }} [opts]
 */
export function recurringPeople(entries, details, { limit = 3, castDepth = 8 } = {}) {
  const people = new Map();
  for (const e of entries) {
    const d = details.get(detailsKey(e));
    const cast = d?.credits?.cast ?? d?.aggregate_credits?.cast ?? [];
    for (const person of cast.slice(0, castDepth)) {
      if (!person?.id) continue;
      let p = people.get(person.id);
      if (!p) { p = { id: person.id, name: person.name, profile_path: person.profile_path, entries: [] }; people.set(person.id, p); }
      if (!p.entries.some(x => x.id === e.id)) p.entries.push(e);
    }
  }
  return [...people.values()]
    .filter(p => p.entries.length > 1)
    .sort((a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(p => {
      const rated = p.entries.filter(e => e.rating > 0);
      const avg = averageStars(rated);
      const allFive = rated.length === p.entries.length && rated.every(e => ratingToStars(e.rating) >= 5);
      const votes = p.entries.map(e => details.get(detailsKey(e))?.vote_average).filter(v => v > 0);
      const crowd = rated.length && votes.length === p.entries.length
        ? mean(p.entries.map(e => (e.rating - details.get(detailsKey(e)).vote_average) / 2)) : null;
      let line = `${p.entries.length} titles this year`;
      if (allFive && rated.length) line += ', all five stars';
      else if (crowd != null && Math.abs(crowd) >= 1) line += `. You rate them ${Math.abs(crowd).toFixed(1)} ${crowd > 0 ? 'above' : 'below'} the crowd`;
      else if (avg) line += `, ${avg.stars} stars on average`;
      return { ...p, count: p.entries.length, line };
    });
}

/**
 * One line about a month, chosen from what is true of it. `allMonths` is the
 * year's month groups so a month can be "busiest" or "kindest".
 * @param {{ year: number, month: number, entries: any[] }} group
 * @param {Array<{ year: number, month: number, entries: any[] }>} allMonths
 * @param {Date} [now]
 */
export function monthInsight(group, allMonths, now = new Date()) {
  const n = group.entries.length;
  if (!n) return null;
  const rated = group.entries.filter(e => e.rating > 0);
  const avg = averageStars(rated);
  const busiest = allMonths.every(g => g.entries.length <= n) && allMonths.length > 1;
  const kindest = avg && allMonths.filter(g => g !== group).every(g => (averageStars(g.entries)?.stars ?? 0) < avg.stars) && allMonths.length > 1 && rated.length >= 3;
  const fives = rated.filter(e => ratingToStars(e.rating) >= 5).length;
  const s = streaks(group.entries, now);
  const wd = favouriteWeekday(group.entries);
  const dnf = group.entries.filter(e => e.dnf).length;

  if (busiest && s.best >= 5) return `${n} titles and a ${s.best}-day streak. Your busiest month.`;
  if (busiest) return `Your busiest month of the year.`;
  if (kindest) return `Your kindest month: ${avg.stars} stars on average${rated.every(e => ratingToStars(e.rating) >= 3) ? ', nothing under 3' : ''}.`;
  if (s.best >= 4) return `A ${s.best}-day streak in here.`;
  if (fives >= 2 && n <= 5) return `${n} titles, ${fives} of them five stars.`;
  if (wd && n >= 4 && wd.count / n >= 0.6) return `${wd.count} of ${n} on a ${wd.name}.`;
  if (dnf && dnf === n) return n === 1 ? `The one you didn't finish.` : `Nothing finished this month.`;
  if (avg && rated.length >= 3) return `${avg.stars} stars on average across ${rated.length} rated.`;
  return null;
}

/**
 * The opening sentence of the year card.
 * @param {{ count: number, topGenre: string | null, weekday: { name: string, count: number, total: number } | null, dnf: number }} s
 */
export function yearSentence(s) {
  if (!s.count) return null;
  const parts = [];
  if (s.topGenre) parts.push(`Mostly ${s.topGenre.toLowerCase()}`);
  if (s.weekday && s.weekday.total >= 5 && s.weekday.count / s.weekday.total >= 0.25) {
    const share = s.weekday.count / s.weekday.total;
    const frac = share >= 0.5 ? 'half of it' : share >= 0.33 ? 'a third of it' : 'a quarter of it';
    parts.push(`${frac} on ${s.weekday.name}s`);
  }
  if (s.dnf === 1) parts.push(`and one you didn't finish`);
  else if (s.dnf > 1) parts.push(`and ${s.dnf} you didn't finish`);
  if (!parts.length) return null;
  const text = parts.join(', ').replace(', and', ' and');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

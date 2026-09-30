// Share cards: the data behind each shareable stat card, as pure functions
// over history rows and Top 5 rows. Rendering is per app (a React component
// on web, the same tree captured with view-shot on mobile); the numbers, the
// unlock thresholds, the caption and the order of the carousel live here so
// both apps agree on what a card says and when it exists.
//
// Design: docs/design/share-cards.md. Scope decisions (owner-only, modal not
// page): docs/adr/0001-share-cards-are-owner-only-and-open-in-a-modal.md.

import { streaks, movieMinutes, formatDuration, averageStars, topGenreId, calendarParts, genreCounts, crowdComparison, crowdSentence, recurringPeople } from './historyStats.js';
import { ratingToStars } from './ratings.js';
import { lastMonth } from './shareMoments.js';
import { emit, SHARE_CARD_REQUESTED_EVENT } from './events.js';
import { TOP_LIST_SIZE } from './listCollections.js';
import { buildProfileShareUrl } from './sharing.js';

export const CARD_IDS = Object.freeze({
  HIGHLIGHTS: 'highlights',
  STREAK: 'streak',
  TOP5_MOVIES: 'top5-movies',
  TOP5_TV: 'top5-tv',
  MONTH_WRAP: 'month-wrap',
  ACTIVITY: 'activity',
  CROWD: 'crowd',
  GENRES: 'genres',
  PERSON: 'person',
});

/** Pixel sizes of the two exported images. Post is X and Threads, Story is Instagram. */
export const CARD_FORMATS = Object.freeze({
  post: Object.freeze({ id: 'post', width: 1200, height: 800 }),
  story: Object.freeze({ id: 'story', width: 1080, height: 1920 }),
});

/** What a card needs before it unlocks. Locked cards stay in the carousel with the count. */
export const THRESHOLDS = Object.freeze({
  highlightsTitles: 10,
  streakDays: 3,
  top5Items: TOP_LIST_SIZE,
  monthWrapTitles: 5,
  activityDays: 15,
  crowdRated: 10,
  genreTitles: 20,
  personTitles: 3,
});

function need(have, needed) {
  return { have: Math.max(0, Math.min(have, needed)), needed, met: have >= needed };
}

function possessive(name) {
  const n = (name || '').trim();
  if (!n) return '';
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

/**
 * "Your year so far": titles, time on screen, top genre, average stars.
 * @param {{ entries?: any[], details?: Map<string, any>, genreName?: (id: number|null) => string|null, year: number, now?: Date }} a
 */
export function highlightsCard({ entries = [], details = new Map(), genreName = () => null, year, now = new Date() }) {
  const count = entries.length;
  const mins = movieMinutes(entries, details);
  const stars = averageStars(entries);
  const genre = genreName(topGenreId(entries)) || null;
  const tiles = [
    { key: 'titles', value: String(count) },
    { key: 'onScreen', value: mins.counted ? formatDuration(mins.minutes) : null },
    { key: 'genre', value: genre },
    { key: 'rating', value: stars ? `${stars.stars}★` : null },
  ].filter(t => t.value);
  return {
    id: CARD_IDS.HIGHLIGHTS,
    ground: 'sage',
    year,
    isCurrentYear: year === now.getFullYear(),
    count,
    genre,
    tiles,
    need: need(count, THRESHOLDS.highlightsTitles),
  };
}

/**
 * The current streak, in days. Survives until a day is actually missed (see streaks()).
 * @param {{ entries?: any[], now?: Date }} a
 */
export function streakCard({ entries = [], now = new Date() }) {
  const s = streaks(entries, now);
  return {
    id: CARD_IDS.STREAK,
    ground: 'pink',
    days: s.current,
    best: s.best,
    need: need(s.current, THRESHOLDS.streakDays),
  };
}

/**
 * A ranked Top 5 as a card. `items` are user_top_lists rows for one list type.
 * @param {{ items?: any[], kind: 'movies'|'tv', profile?: { display_name?: string|null, username?: string|null } }} a
 */
export function top5Card({ items = [], kind, profile = {} }) {
  const ranked = [...items]
    .filter(r => r && r.rank >= 1 && r.rank <= TOP_LIST_SIZE)
    .sort((a, b) => a.rank - b.rank)
    .map(r => ({ rank: r.rank, tmdb_id: r.tmdb_id, title: r.title, poster_path: r.poster_path || null }));
  const name = profile.display_name || profile.username || '';
  return {
    id: kind === 'tv' ? CARD_IDS.TOP5_TV : CARD_IDS.TOP5_MOVIES,
    ground: kind === 'tv' ? 'sage' : 'cream',
    kind,
    owner: possessive(name),
    handle: profile.username ? `@${profile.username}` : null,
    items: ranked,
    need: need(ranked.length, THRESHOLDS.top5Items),
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Last month, wrapped: titles, the best night, the five-star titles, what
 * was not finished. `entries` may be the whole history; only last month's
 * rows count.
 * @param {{ entries?: any[], now?: Date }} a
 */
export function monthWrapCard({ entries = [], now = new Date() }) {
  const { year, month } = lastMonth(now);
  const rows = entries.filter(e => { const p = calendarParts(e.watched_at); return p && p.year === year && p.month === month; });
  const byDay = new Map();
  for (const e of rows) { const p = calendarParts(e.watched_at); byDay.set(p.day, (byDay.get(p.day) || 0) + 1); }
  let bestNight = null;
  for (const [d, n] of byDay) {
    if (!bestNight || n > bestNight.count || (n === bestNight.count && d < bestNight.day)) {
      const p = calendarParts(rows.find(e => calendarParts(e.watched_at).day === d).watched_at);
      bestNight = { day: d, count: n, label: `${WEEKDAYS[p.weekday]} ${d}` };
    }
  }
  const fiveStars = rows.filter(e => e.rating > 0 && ratingToStars(e.rating) >= 5).map(e => e.title);
  return {
    id: CARD_IDS.MONTH_WRAP,
    ground: 'pink',
    year, month,
    monthName: MONTHS[month],
    count: rows.length,
    bestNight,
    fiveStars,
    dnf: rows.filter(e => e.dnf).length,
    need: need(rows.length, THRESHOLDS.monthWrapTitles),
  };
}

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayNum = (y, m, d) => Date.UTC(y, m, d) / 86400000;

/**
 * The watch-activity grid: `weeks` columns of seven days ending in the
 * current week, one level per day, the busiest day marked. Rows run Monday
 * to Sunday; a week is a column.
 * @param {{ entries?: any[], now?: Date, weeks?: number }} a
 */
export function activityCard({ entries = [], now = new Date(), weeks = 22 }) {
  const today = dayNum(now.getFullYear(), now.getMonth(), now.getDate());
  const todayMonIdx = (new Date(today * 86400000).getUTCDay() + 6) % 7; // 0 = Monday
  const start = today - todayMonIdx - (weeks - 1) * 7;
  const counts = new Map();
  for (const e of entries) {
    const p = calendarParts(e.watched_at);
    if (!p) continue;
    const n = dayNum(p.year, p.month, p.day);
    if (n >= start && n <= today) counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = null;
  for (const [n, c] of counts) if (!best || c > best.count || (c === best.count && n > best.n)) best = { n, count: c };
  const cols = [];
  const months = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const n = start + w * 7 + d;
      const date = new Date(n * 86400000);
      if (d === 0 && date.getUTCMonth() !== lastMonth) { lastMonth = date.getUTCMonth(); if (w > 0 || date.getUTCDate() <= 7) months.push({ col: w, label: MON3[lastMonth] }); }
      const count = counts.get(n) || 0;
      col.push({
        count,
        level: count >= 3 ? 3 : count,
        best: !!best && n === best.n,
        future: n > today,
        today: n === today,
      });
    }
    cols.push(col);
  }
  const bestLabel = best ? (() => { const d = new Date(best.n * 86400000); return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON3[d.getUTCMonth()]}`; })() : null;
  return {
    id: CARD_IDS.ACTIVITY,
    ground: 'cream',
    weeks: cols,
    months,
    best: best ? { label: bestLabel, count: best.count } : null,
    watchDays: counts.size,
    need: need(counts.size, THRESHOLDS.activityDays),
  };
}

/** +½★, −¼★, +1★, +1¼★ … to the nearest quarter star; '=' inside a tenth. */
function starDelta(d) {
  if (Math.abs(d) < 0.1) return '=';
  const q = Math.round(Math.abs(d) * 4) / 4;
  const whole = Math.floor(q), frac = q - whole;
  const fracGlyph = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac] ?? '';
  return `${d > 0 ? '+' : '−'}${whole || (fracGlyph ? '' : '0')}${fracGlyph}★`;
}

/**
 * How the user rates against TMDB's audience. The sentence is the one the
 * History page already writes; here it is split into the headline and the
 * "except about" line, and the delta becomes a gauge.
 * @param {{ entries?: any[], details?: Map<string, any> }} a
 */
export function crowdCard({ entries = [], details = new Map() }) {
  const cmp = crowdComparison(entries, details);
  const compared = cmp?.compared ?? 0;
  const delta = cmp?.deltaStars ?? 0;
  const sentence = compared ? crowdSentence(cmp) : null;
  let headline = sentence, except = null;
  const m = sentence && /^(.*?),? except about (.*)\.$/.exec(sentence);
  if (m) { headline = `${m[1]}.`; except = `Except about ${m[2]}.`; }
  return {
    id: CARD_IDS.CROWD,
    ground: 'charcoal',
    compared,
    deltaStars: delta,
    delta: starDelta(delta),
    word: Math.abs(delta) < 0.15 ? 'inStep' : delta > 0 ? 'kinder' : 'harsher',
    gauge: 0.5 + Math.max(-1.5, Math.min(1.5, delta)) / 3, // 0..1 along the arc
    headline,
    except,
    need: need(compared, THRESHOLDS.crowdRated),
  };
}

/**
 * The five genres watched most, as a share of the titles that have genres.
 * @param {{ entries?: any[], genreName?: (id: number) => string|null }} a
 */
export function genresCard({ entries = [], genreName = () => null }) {
  const withGenres = entries.filter(e => e.genre_ids?.length).length;
  const top = genreCounts(entries).map(g => ({ id: g.id, name: genreName(g.id), count: g.count })).filter(g => g.name).slice(0, 5);
  const lead = top[0]?.count || 1;
  return {
    id: CARD_IDS.GENRES,
    ground: 'rose',
    rows: top.map(g => ({ name: g.name, count: g.count, pct: withGenres ? Math.round(100 * g.count / withGenres) : 0, width: Math.round(100 * g.count / lead) })),
    need: need(withGenres, THRESHOLDS.genreTitles),
  };
}

/**
 * The actor who turned up most this year, with the line the History page
 * writes about them and up to four of the titles.
 * @param {{ entries?: any[], details?: Map<string, any> }} a
 */
export function personCard({ entries = [], details = new Map() }) {
  const p = recurringPeople(entries, details, { limit: 1 })[0] || null;
  return {
    id: CARD_IDS.PERSON,
    ground: 'sage',
    name: p?.name ?? null,
    profile_path: p?.profile_path ?? null,
    line: p?.line ?? null,
    titles: p ? p.entries.map(e => e.title).slice(0, 4) : [],
    count: p?.count ?? 0,
    need: need(p?.count ?? 0, THRESHOLDS.personTitles),
  };
}

/**
 * Every card in carousel order, locked ones included. The first three ship
 * first (docs/design/share-cards.md, "Build order"); the rest join here.
 * @param {{
 *   entries?: any[], details?: Map<string, any>, genreName?: Function, year: number, now?: Date,
 *   topLists?: { movies?: any[], tv?: any[] }, profile?: object,
 *   allEntries?: any[],
 * }} a  `entries` are the year's rows; `allEntries` (default: the same) is
 *   the whole history, for the month wrap when last month was last year.
 */
export function buildShareCards({ entries = [], details, genreName, year, now = new Date(), topLists = {}, profile = {}, allEntries }) {
  return [
    highlightsCard({ entries, details, genreName, year, now }),
    streakCard({ entries, now }),
    activityCard({ entries: allEntries ?? entries, now }),
    crowdCard({ entries, details }),
    top5Card({ items: topLists.movies, kind: 'movies', profile }),
    top5Card({ items: topLists.tv, kind: 'tv', profile }),
    genresCard({ entries, genreName }),
    personCard({ entries, details }),
    monthWrapCard({ entries: allEntries ?? entries, now }),
  ].map(card => ({ ...card, available: card.need.met }));
}

/**
 * Ask the app to open the sheet on a card, from anywhere: a toast, a
 * notification, a deep link handler. Each app mounts one host that listens.
 * @param {{ card: string, source: string }} req
 */
export function requestShareCard(req) {
  emit(SHARE_CARD_REQUESTED_EVENT, req);
}

/**
 * The carousel with the two Top 5 cards first. The profile opens the sheet
 * this way: Top 5 is what you came for from a profile, so both of them lead
 * and the year cards follow.
 */
export function leadWithTop5(cards) {
  const isTop5 = c => c.id === CARD_IDS.TOP5_MOVIES || c.id === CARD_IDS.TOP5_TV;
  return [...cards.filter(isTop5), ...cards.filter(c => !isTop5(c))];
}

/** Index of the card to open on, or 0 when the preset is unknown. */
export function presetIndex(cards, presetId) {
  const i = cards.findIndex(c => c.id === presetId);
  return i === -1 ? 0 : i;
}

/**
 * The prewritten post text. The profile link goes in the caption, never on
 * the image (the image carries the @handle). `copy` is SHARE_CARDS.captions.
 * @param {object} card
 * @param {{ username?: string|null }} profile
 * @param {{ highlights: Function, streak: Function, top5: Function }} copy
 */
export function shareCaption(card, profile, copy) {
  const url = buildProfileShareUrl({ username: profile?.username || '' }) || '';
  switch (card.id) {
    case CARD_IDS.HIGHLIGHTS: return copy.highlights(card, url);
    case CARD_IDS.STREAK: return copy.streak(card, url);
    case CARD_IDS.TOP5_MOVIES:
    case CARD_IDS.TOP5_TV: return copy.top5(card, url);
    case CARD_IDS.MONTH_WRAP: return copy.monthWrap(card, url);
    case CARD_IDS.ACTIVITY: return copy.activity(card, url);
    case CARD_IDS.CROWD: return copy.crowd(card, url);
    case CARD_IDS.GENRES: return copy.genres(card, url);
    case CARD_IDS.PERSON: return copy.person(card, url);
    default: return url;
  }
}

/** Filename for a download, e.g. plot-streak-story.png */
export function cardFilename(card, format) {
  return `plot-${card.id}-${format}.png`;
}

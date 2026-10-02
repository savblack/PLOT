/**
 * Following people, client side: turning people_feed rows into what Home's
 * Your people shelf and the Your people page show, and a person's own credits
 * into the Coming up strip on their page. Shared by web and mobile.
 *
 * The feed itself is written server-side by the premium-alerts job
 * (supabase/functions/_shared/premiumAlerts.js has the rules for which credits
 * count). The appearance rule below mirrors that file's isAppearance;
 * apps/web/tests/unit/peopleRules.test.js keeps the two in step.
 */

// TMDB genres that are appearances rather than roles: News, Reality, Talk.
const APPEARANCE_GENRES = new Set([10763, 10764, 10767]);
const SELF_ROLE = /\b(self|himself|herself|themselves|themself)\b/i;

/** Playing yourself, or a talk, news or reality show. @param {any} credit */
export function isAppearance(credit) {
  if ((credit?.genre_ids ?? []).some((/** @type {number} */ g) => APPEARANCE_GENRES.has(g))) return true;
  return SELF_ROLE.test(String(credit?.character ?? ''));
}

/** @param {unknown} value @returns {string | null} */
function dateOnly(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * @typedef {object} ComingUpItem
 * @property {number} tmdbId
 * @property {'movie' | 'tv'} mediaType
 * @property {string} title
 * @property {string | null} posterPath
 * @property {string | null} role     the character, or the crew job
 * @property {string} date            YYYY-MM-DD
 * @property {boolean} today
 */

/**
 * A person's dated work from today on, soonest first, for the Coming up strip
 * on their page. Built from the combined_credits the page already loads, so it
 * shows before (and without) following. One entry per title.
 *
 * @param {any} credits /person/{id}/combined_credits body
 * @param {string} todayStr YYYY-MM-DD
 * @returns {ComingUpItem[]}
 */
export function comingUpFromCredits(credits, todayStr) {
  /** @type {Map<string, ComingUpItem>} */
  const byTitle = new Map();
  for (const credit of [...(credits?.cast ?? []), ...(credits?.crew ?? [])]) {
    if (!credit || typeof credit.id !== 'number') continue;
    if (credit.media_type !== 'movie' && credit.media_type !== 'tv') continue;
    if (isAppearance(credit)) continue;
    if (credit.job && credit.job !== 'Director' && credit.job !== 'Creator') continue;
    const date = dateOnly(credit.media_type === 'movie' ? credit.release_date : credit.first_air_date);
    if (!date || date < todayStr) continue;
    const title = credit.title ?? credit.name;
    if (typeof title !== 'string' || !title) continue;
    const key = `${credit.media_type}:${credit.id}`;
    if (byTitle.has(key)) continue;
    byTitle.set(key, {
      tmdbId: credit.id,
      mediaType: credit.media_type,
      title,
      posterPath: typeof credit.poster_path === 'string' ? credit.poster_path : null,
      role: (credit.character || credit.job || null),
      date,
      today: date === todayStr,
    });
  }
  return [...byTitle.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** @typedef {'outToday' | 'inCinemas' | 'newSeason' | 'dated' | null} FeedChip */

/**
 * @typedef {object} FeedItem
 * @property {string} key            media:id:season
 * @property {number} tmdbId
 * @property {'movie' | 'tv'} mediaType
 * @property {number} season         0 for a film or a series as a whole
 * @property {'film' | 'series' | 'season'} kind
 * @property {string} title
 * @property {string | null} posterPath
 * @property {string | null} date    YYYY-MM-DD for the viewer's region
 * @property {'theatrical' | 'digital' | null} releaseKind  films only
 * @property {boolean} out           released on or before today
 * @property {FeedChip} chip
 * @property {string | null} network
 * @property {number | null} episodeCount
 * @property {number | null} premiereDrop
 * @property {Array<{ id: number, name: string, role: string }>} people
 */

/**
 * The viewer's date for a feed row: a film's first general release in their
 * region when TMDB has one, otherwise its primary date (shown, but never
 * called "in cinemas"). A show's season dates are the same everywhere.
 *
 * @param {any} row people_feed row
 * @param {string} region
 * @returns {{ date: string | null, releaseKind: 'theatrical' | 'digital' | null }}
 */
export function viewerDate(row, region) {
  if (row?.media_type === 'movie') {
    const r = row.regional_releases?.[region];
    if (r && (r.kind === 'theatrical' || r.kind === 'digital') && dateOnly(r.date)) return { date: r.date, releaseKind: r.kind };
  }
  return { date: dateOnly(row?.release_date), releaseKind: null };
}

/**
 * The chip a feed item wears. Out today wins; then a film in cinemas, a new
 * season (out or dated); then Dated for anything ahead.
 * @param {{ mediaType: string, kind: string, date: string | null, releaseKind: string | null }} item
 * @param {string} todayStr
 * @returns {FeedChip}
 */
export function feedChip(item, todayStr) {
  if (!item.date) return null;
  if (item.date === todayStr) return 'outToday';
  if (item.mediaType === 'tv' && item.kind === 'season') return 'newSeason';
  if (item.date > todayStr) return 'dated';
  if (item.releaseKind === 'theatrical') return 'inCinemas';
  return null;
}

// How long something stays "out now" on the shelf and the page.
export const OUT_NOW_DAYS = 45;

/**
 * people_feed rows → one item per title (or season), with every followed person
 * in it. Out-now items first, newest first; then dated ones, soonest first.
 * Rows outside the window, or undated, are dropped.
 *
 * @param {any[]} rows people_feed rows for the people the viewer follows
 * @param {{ region: string, today: string, outNowDays?: number }} opts
 * @returns {FeedItem[]}
 */
export function feedItems(rows, { region, today, outNowDays = OUT_NOW_DAYS }) {
  const oldest = shiftDay(today, -outNowDays);
  /** @type {Map<string, FeedItem>} */
  const byKey = new Map();
  for (const row of rows ?? []) {
    if (!row || (row.media_type !== 'movie' && row.media_type !== 'tv')) continue;
    const { date, releaseKind } = viewerDate(row, region);
    if (!date || date < oldest) continue;
    const season = Number(row.season_number) || 0;
    const key = `${row.media_type}:${row.tmdb_id}:${season}`;
    let item = byKey.get(key);
    if (!item) {
      item = {
        key, tmdbId: row.tmdb_id, mediaType: row.media_type, season, kind: row.kind,
        title: row.title, posterPath: row.poster_path ?? null, date, releaseKind,
        out: date <= today, chip: null, network: row.network ?? null,
        episodeCount: row.episode_count ?? null, premiereDrop: row.premiere_drop ?? null, people: [],
      };
      item.chip = feedChip(item, today);
      byKey.set(key, item);
    }
    if (!item.people.some(p => p.id === row.tmdb_person_id)) {
      item.people.push({ id: row.tmdb_person_id, name: row.person_name, role: row.person_role });
    }
  }
  const items = [...byKey.values()];
  const out = items.filter(i => i.out).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title));
  const ahead = items.filter(i => !i.out).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.title.localeCompare(b.title));
  return [...out, ...ahead];
}

/**
 * The page's type filter, the same Movies / TV / Cinema rows as every other
 * page. Cinema is a film whose release in the viewer's region is theatrical.
 * @param {FeedItem[]} items @param {string[]} typeFilters ids from TYPE_ROWS
 */
export function filterFeedByType(items, typeFilters) {
  if (!typeFilters?.length || typeFilters.length >= 3) return items;
  return items.filter(i => {
    if (i.mediaType === 'tv') return typeFilters.includes('tv');
    if (i.releaseKind === 'theatrical') return typeFilters.includes('cinema');
    return typeFilters.includes('movie');
  });
}

/**
 * Sections for the page's By date view: "out" (everything already out), then
 * one per month ahead, keyed YYYY-MM.
 * @param {FeedItem[]} items as returned by feedItems
 * @returns {Array<{ key: string, items: FeedItem[] }>}
 */
export function groupByDate(items) {
  /** @type {Array<{ key: string, items: FeedItem[] }>} */
  const groups = [];
  for (const item of items) {
    const key = item.out ? 'out' : (item.date ?? '').slice(0, 7);
    let group = groups.find(g => g.key === key);
    if (!group) groups.push(group = { key, items: [] });
    group.items.push(item);
  }
  return groups;
}

/**
 * Sections for the By person view, in the order of the follow list; a title
 * with two followed people appears under both.
 * @param {FeedItem[]} items
 * @param {Array<{ tmdb_person_id: number, name: string }>} follows
 * @returns {Array<{ person: { id: number, name: string }, items: FeedItem[] }>}
 */
export function groupByPerson(items, follows) {
  return (follows ?? [])
    .map(f => ({ person: { id: f.tmdb_person_id, name: f.name }, items: items.filter(i => i.people.some(p => p.id === f.tmdb_person_id)) }))
    .filter(g => g.items.length);
}

/** YYYY-MM-DD shifted by whole days. @param {string} day @param {number} days */
export function shiftDay(day, days) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

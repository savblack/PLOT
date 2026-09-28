// Share cards: the data behind each shareable stat card, as pure functions
// over history rows and Top 5 rows. Rendering is per app (a React component
// on web, the same tree captured with view-shot on mobile); the numbers, the
// unlock thresholds, the caption and the order of the carousel live here so
// both apps agree on what a card says and when it exists.
//
// Design: docs/design/share-cards.md. Scope decisions (owner-only, modal not
// page): docs/adr/0001-share-cards-are-owner-only-and-open-in-a-modal.md.

import { streaks, movieMinutes, formatDuration, averageStars, topGenreId } from './historyStats.js';
import { TOP_LIST_SIZE } from './listCollections.js';
import { buildProfileShareUrl } from './sharing.js';

export const CARD_IDS = Object.freeze({
  HIGHLIGHTS: 'highlights',
  STREAK: 'streak',
  TOP5_MOVIES: 'top5-movies',
  TOP5_TV: 'top5-tv',
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

/**
 * Every card in carousel order, locked ones included. The first three ship
 * first (docs/design/share-cards.md, "Build order"); the rest join here.
 * @param {{
 *   entries?: any[], details?: Map<string, any>, genreName?: Function, year: number, now?: Date,
 *   topLists?: { movies?: any[], tv?: any[] }, profile?: object,
 * }} a
 */
export function buildShareCards({ entries = [], details, genreName, year, now = new Date(), topLists = {}, profile = {} }) {
  return [
    highlightsCard({ entries, details, genreName, year, now }),
    streakCard({ entries, now }),
    top5Card({ items: topLists.movies, kind: 'movies', profile }),
    top5Card({ items: topLists.tv, kind: 'tv', profile }),
  ].map(card => ({ ...card, available: card.need.met }));
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
    default: return url;
  }
}

/** Filename for a download, e.g. plot-streak-story.png */
export function cardFilename(card, format) {
  return `plot-${card.id}-${format}.png`;
}

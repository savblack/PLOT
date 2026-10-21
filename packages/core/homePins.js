/* Pinned shelves: turning a saved pin into something Home can draw.
 *
 * The pins themselves (and their rules) are in homeLayout.js. This resolves a
 * pin against what the viewer has right now: their Want to Watch, their custom
 * lists and the people they follow. A pin to a list that was deleted, or a
 * person who was unfollowed, simply resolves to nothing and is not drawn; it
 * stays saved, so re-following the person brings the shelf back.
 *
 * Pure functions: the data comes in as arguments, so web and mobile feed them
 * from their own hooks and tests need no network.
 */
import { DISCOVER_VIEW } from './copy/discoverView.js';
import { WATCHLIST_PIN_ID, homePinKey } from './homeLayout.js';
import { wantToWatchItems } from './listCollections.js';
import { feedItems } from './peopleFeed.js';

const KINDS = DISCOVER_VIEW.customize.pinKinds;

/** The card shape both apps already draw for a title (see Home's Saved shelf). */
export function pinnedTitle(row) {
  return {
    id: row.tmdb_id ?? row.id,
    media_type: row.media_type === 'tv' ? 'tv' : 'movie',
    title: row.title ?? row.name ?? '',
    poster_path: row.poster_path ?? null,
    release_date: row.release_date ?? null,
    first_air_date: row.first_air_date ?? null,
  };
}

/**
 * @param {{ kind: string, id: string }} pin
 * @param {{ lists: any[], follows: any[] }} ctx lists: the viewer's custom lists; follows: people they follow
 * @returns {string | null} what to call the shelf, or null if the pin no longer resolves
 */
export function pinLabel(pin, { lists, follows }) {
  if (pin.kind === 'watchlist') return KINDS.watchlist;
  if (pin.kind === 'list') return (lists ?? []).find(l => String(l.id) === pin.id)?.name ?? null;
  if (pin.kind === 'person') return (follows ?? []).find(f => String(f.tmdb_person_id) === pin.id)?.name ?? null;
  return null;
}

/** @returns {boolean} true while the pin still points at something the viewer has */
export const pinExists = (pin, ctx) => pinLabel(pin, ctx) !== null;

/**
 * What the viewer could still pin, grouped for a picker. Empty groups are
 * left out, and anything already pinned is not offered again.
 * @param {{ layout: import('./homeLayout.js').HomeLayout, lists: any[], follows: any[] }} ctx
 * @returns {{ kind: 'watchlist' | 'list' | 'person', label: string, items: { pin: { kind: string, id: string }, label: string }[] }[]}
 */
export function pinOptions({ layout, lists, follows }) {
  const taken = new Set((layout?.pins ?? []).map(homePinKey));
  const free = (pin) => !taken.has(homePinKey(pin));
  const groups = [
    { kind: 'watchlist', label: KINDS.watchlist, items: [{ pin: { kind: 'watchlist', id: WATCHLIST_PIN_ID }, label: KINDS.watchlist }] },
    { kind: 'list', label: KINDS.list, items: (lists ?? []).filter(l => l?.id && l?.name).map(l => ({ pin: { kind: 'list', id: String(l.id) }, label: l.name })) },
    { kind: 'person', label: KINDS.person, items: (follows ?? []).filter(f => f?.tmdb_person_id && f?.name).map(f => ({ pin: { kind: 'person', id: String(f.tmdb_person_id) }, label: f.name })) },
  ];
  return groups.map(g => ({ ...g, items: g.items.filter(i => free(i.pin)) })).filter(g => g.items.length > 0);
}

/**
 * The titles for a Want to Watch or list pin.
 * @param {{ kind: string, id: string }} pin
 * @param {{ watchlistItems: any[], watchingItems: any[], lists: any[], today: string, limit?: number }} ctx
 */
export function pinnedTitles(pin, { watchlistItems, watchingItems, lists, today, limit = 20 }) {
  if (pin.kind === 'watchlist') return wantToWatchItems(watchlistItems, watchingItems, today).slice(0, limit).map(pinnedTitle);
  if (pin.kind === 'list') return ((lists ?? []).find(l => String(l.id) === pin.id)?.items ?? []).slice(0, limit).map(pinnedTitle);
  return [];
}

/**
 * The recent and upcoming titles for a person pin, from the people feed rows.
 * @param {any[]} rows people_feed rows (any people; filtered here)
 * @param {string} personId
 * @param {{ region: string, today: string, limit?: number }} opts
 */
export function pinnedPersonItems(rows, personId, { region, today, limit = 20 }) {
  const mine = (rows ?? []).filter(r => String(r.tmdb_person_id) === String(personId));
  return feedItems(mine, { region, today }).slice(0, limit);
}

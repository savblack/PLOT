// Watch together (Premium): pure rules shared by web and mobile. The server is
// the authority (supabase/migrations/20260927100000_watch_together.sql); these
// helpers only decide what to show. Design: docs/design/watch-together/README.md.

import { WATCH_TOGETHER } from './copy/watchTogether.js';
import { TONIGHT_PICKER } from './copy/tonightPicker.js';
import { MOOD_GENRES, MOODS } from './moodGenres.js';

/** @typedef {'profile' | 'following' | 'none'} RequestsFrom */
/** @typedef {'none' | 'outgoing' | 'incoming' | 'paired'} PairState */
/** @typedef {'free' | 'public' | 'private' | 'pending' | 'incoming' | 'paired'} TileMode */

/**
 * @typedef {object} WatchTogetherRow  One row of list_watch_together().
 * @property {string} other_id
 * @property {string} username
 * @property {string | null} display_name
 * @property {string | null} avatar_url
 * @property {'paired' | 'incoming' | 'outgoing'} direction
 * @property {string} created_at
 * @property {string | null} accepted_at
 * @property {boolean} i_share_full
 * @property {number | null} overlap_count
 * @property {boolean} can_decide  The viewer or this partner has Premium.
 */

/**
 * @typedef {object} WatchTogetherSuggestion  One row of suggest_watch_together().
 * @property {string} id
 * @property {string} username
 * @property {string | null} display_name
 * @property {string | null} avatar_url
 * @property {number | null} overlap_count  Only when their watchlist is public.
 */

/**
 * @typedef {object} WatchTogetherTitle  One row of watch_together_titles().
 * @property {number} tmdb_id
 * @property {string} media_type
 * @property {string | null} title
 * @property {string | null} poster_path
 * @property {string | null} release_date
 * @property {number[]} genre_ids
 * @property {number[]} provider_ids
 * @property {string[]} saved_by  The viewer first when they saved it.
 */

export const REQUESTS_FROM_OPTIONS = /** @type {const} */ (['profile', 'following', 'none']);

/**
 * Which state the invite tile on someone's profile shows. 'free' is a Free
 * viewer: they can still invite (one of you needs Premium to decide).
 *
 * @param {{ viewerPremium: boolean, targetPublic: boolean, state?: PairState | null }} input
 * @returns {TileMode}
 */
export function tileMode({ viewerPremium, targetPublic, state }) {
  if (state === 'paired') return 'paired';
  if (state === 'incoming') return 'incoming';
  if (state === 'outgoing') return 'pending';
  if (!viewerPremium) return 'free';
  return targetPublic ? 'public' : 'private';
}

/**
 * Whether the tile may show an overlap count. The server decides: it returns
 * a count only once you're partners or when you can already see their
 * watchlist (can_view_watchlist), so any number it sends is safe to show,
 * whatever the tile's state.
 *
 * @param {TileMode} _mode
 * @param {number | null | undefined} count
 */
export function tileShowsCount(_mode, count) {
  return typeof count === 'number';
}

/**
 * Split list_watch_together() rows for the hub and settings.
 *
 * @param {WatchTogetherRow[] | null | undefined} rows
 */
export function splitWatchTogether(rows) {
  const list = rows || [];
  return {
    partners: list.filter(r => r.direction === 'paired'),
    incoming: list.filter(r => r.direction === 'incoming'),
    outgoing: list.filter(r => r.direction === 'outgoing'),
  };
}

/** @param {{ display_name?: string | null, username?: string | null }} person */
export function personName(person) {
  return person?.display_name || person?.username || '?';
}

/**
 * The meta line under a shared title: "2024" for a movie, "2019 · Show" for a
 * show. Web and mobile both render it under posters, swipe cards and rows.
 *
 * @param {{ release_date?: string | null, media_type?: string | null }} title
 * @returns {string}
 */
export function titleMeta(title) {
  const year = (title?.release_date || '').slice(0, 4);
  const kind = title?.media_type === 'tv' ? WATCH_TOGETHER.overlap.show : null;
  return [year, kind].filter(Boolean).join(' · ');
}

/**
 * Filter shared titles by type. 'all' keeps everything.
 *
 * @param {WatchTogetherTitle[]} titles
 * @param {'all' | 'movie' | 'tv'} kind
 */
export function filterByKind(titles, kind) {
  if (kind === 'all') return titles;
  return titles.filter(t => t.media_type === kind);
}

/**
 * Split group titles into "saved by everyone" and "saved by some of you".
 *
 * @param {WatchTogetherTitle[]} titles
 * @param {number} groupSize  Everyone deciding, the viewer included.
 */
export function splitGroupMatches(titles, groupSize) {
  return {
    all: titles.filter(t => t.saved_by.length >= groupSize),
    some: titles.filter(t => t.saved_by.length < groupSize),
  };
}

/**
 * Pick a title at random for "Shuffle", avoiding the one already shown when
 * there is a choice.
 *
 * @param {WatchTogetherTitle[]} titles
 * @param {number | null} [currentId]
 * @param {() => number} [random]
 */
export function shufflePick(titles, currentId = null, random = Math.random) {
  if (!titles.length) return null;
  const pool = titles.length > 1 ? titles.filter(t => t.tmdb_id !== currentId) : titles;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

/**
 * The server raises plain codes; map anything else to 'generic'.
 *
 * @param {{ message?: string } | null | undefined} error
 * @returns {'premium_required' | 'not_allowed' | 'nothing_fits' | 'generic'}
 */
export function watchTogetherErrorCode(error) {
  const message = error?.message || '';
  if (message.includes('premium_required')) return 'premium_required';
  if (message.includes('not_allowed')) return 'not_allowed';
  if (message.includes('nothing_fits')) return 'nothing_fits';
  return 'generic';
}

/* ── Two-person yes-or-no session ─────────────────────────────────────── */

/**
 * @typedef {object} SessionCard
 * @property {number} tmdb_id
 * @property {string} media_type
 * @property {string | null} title
 * @property {string | null} poster_path
 * @property {string | null} release_date
 */

/**
 * @typedef {object} SessionState  get_watch_together_session() from the viewer's side.
 * @property {string} id
 * @property {string} other_id
 * @property {boolean} live
 * @property {SessionFilters | null} [filters]  Set when the session was started with a mood.
 * @property {SessionCard[]} deck
 * @property {{ tmdb_id: number, media_type: string, yes: boolean }[]} my_votes
 * @property {number} other_answered
 * @property {{ tmdb_id: number, media_type: string }[]} matches
 */

/** @param {{ tmdb_id: number, media_type: string }} t */
export const titleKey = (t) => `${t.media_type}:${t.tmdb_id}`;

/**
 * Where the viewer is in the deck: the next unanswered card, how many they've
 * answered, and the matched cards with their details.
 *
 * @param {SessionState | null} session
 */
export function sessionProgress(session) {
  if (!session) return { card: null, index: 0, total: 0, answered: 0, done: false, matches: [] };
  const answered = new Set(session.my_votes.map(titleKey));
  const index = session.deck.findIndex(c => !answered.has(titleKey(c)));
  const matchKeys = new Set(session.matches.map(titleKey));
  return {
    card: index === -1 ? null : session.deck[index],
    index: index === -1 ? session.deck.length : index,
    total: session.deck.length,
    answered: answered.size,
    done: index === -1,
    matches: session.deck.filter(c => matchKeys.has(titleKey(c))),
  };
}

/** How far a swipe has to travel, in px, to count as an answer. */
export const SWIPE_THRESHOLD = 110;

/**
 * A finished swipe: 'yes' (right), 'no' (left) or null (spring back).
 *
 * @param {number} dx
 * @param {number} [threshold]
 * @returns {'yes' | 'no' | null}
 */
export function swipeDecision(dx, threshold = SWIPE_THRESHOLD) {
  if (dx > threshold) return 'yes';
  if (dx < -threshold) return 'no';
  return null;
}

/** The Realtime broadcast channel for a session; carries pings only, no data. */
export const sessionChannel = (sessionId) => `wt-session:${sessionId}`;

/* ── Free start page ─────────────────────────────────────────────────── */

/** How many of your own titles the try-it demo uses. */
export const DEMO_SIZE = 5;

/**
 * Up to DEMO_SIZE titles from the viewer's watchlist for the try-it demo,
 * in a random order.
 *
 * @template {{ tmdb_id: number, media_type: string }} T
 * @param {T[] | null | undefined} items
 * @param {() => number} [random]
 * @returns {T[]}
 */
export function pickDemoDeck(items, random = Math.random) {
  const pool = (items || []).filter(t => t && t.tmdb_id && t.media_type);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DEMO_SIZE);
}

/**
 * The example partner's answer in the demo. Says yes about half the time, and
 * always on the last card if there hasn't been a match yet, so every run of
 * the demo ends on "You're both in".
 *
 * @param {{ index: number, total: number, matchedSoFar: boolean, random?: () => number }} input
 */
export function demoPartnerSaysYes({ index, total, matchedSoFar, random = Math.random }) {
  if (!matchedSoFar && index >= total - 1) return true;
  return random() < 0.5;
}

/**
 * Partners who were waiting on Premium before the viewer upgraded: the ones
 * remembered as locked (can_decide false) that can decide now.
 *
 * @param {WatchTogetherRow[]} partners
 * @param {string[] | null | undefined} rememberedLocked  other_ids seen locked while on Free
 */
export function unlockedPartners(partners, rememberedLocked) {
  const was = new Set(rememberedLocked || []);
  return partners.filter(p => was.has(p.other_id) && p.can_decide !== false);
}

/** Per-device record of when the viewer last shared their invite link. */
export const INVITE_SHARED_KEY = 'plot_wt_invite_shared_at';

/**
 * Which top card the hub shows: the invite card on its own while nobody has
 * joined, "waiting" once the link has gone out, or the row of people.
 *
 * @param {{ partners: unknown[], incoming: unknown[], outgoing: unknown[], sharedAt?: string | null }} input
 * @returns {'invite' | 'waiting' | 'people'}
 */
export function hubStage({ partners, incoming, outgoing, sharedAt }) {
  if (partners.length || incoming.length || outgoing.length) return 'people';
  return sharedAt ? 'waiting' : 'invite';
}

/**
 * "November 11" for the waiting card. US date order (Plot's copy is American).
 *
 * @param {string | null | undefined} iso
 */
export function sharedOnDate(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';
}

/**
 * Names for a shelf heading: "Sam", "Sam and Priya", "Sam, Priya and Jo".
 *
 * @param {string[]} names
 */
export function joinNames(names) {
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * TMDB trending results as example titles: movies and shows with a poster.
 *
 * @param {any[] | null | undefined} results  tmdb.getTrending().results
 * @returns {SessionCard[]}
 */
export function trendingAsTitles(results) {
  return (results || [])
    .filter(r => r && (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path && (r.title || r.name))
    .map(r => ({
      tmdb_id: r.id,
      media_type: r.media_type,
      title: r.title || r.name,
      poster_path: r.poster_path,
      release_date: r.release_date || r.first_air_date || null,
    }));
}

/**
 * Ideas for people with nothing saved in common yet: trending titles the
 * viewer hasn't saved, so every one is something new they could save. Saving
 * one can create a match on the spot when the partner already has it.
 *
 * @param {SessionCard[] | null | undefined} trending  trendingAsTitles() output
 * @param {{ tmdb_id: number, media_type: string }[] | null | undefined} saved  The viewer's watchlist
 * @param {number} [limit]
 * @returns {SessionCard[]}
 */
export function saveIdeas(trending, saved, limit = 12) {
  const have = new Set((saved || []).filter(t => t && t.tmdb_id && t.media_type).map(titleKey));
  return (trending || []).filter(t => t && !have.has(titleKey(t))).slice(0, limit);
}

/**
 * Titles for the start page's example and demo: the viewer's own saved titles
 * that have a poster, topped up from trending, without repeats.
 *
 * @param {{ tmdb_id: number, media_type: string, poster_path?: string | null }[] | null | undefined} saved
 * @param {SessionCard[] | null | undefined} fallback
 */
export function exampleTitlePool(saved, fallback) {
  const seen = new Set();
  const out = [];
  for (const t of [...(saved || []), ...(fallback || [])]) {
    if (!t || !t.tmdb_id || !t.media_type || !t.poster_path) continue;
    const k = titleKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/* ── The mood step before a session ───────────────────────────────────── */
//
// Before the cards, the starter picks Movies or TV, any number of moods, and
// "My services". The deck is the shared titles that fit
// (start_watch_together_session_filtered). Moods reuse Just Decide's chips
// (moodGenres.js), but only the genres list_items stores: the keyword-backed
// show genres (negative ids) need a TMDB lookup the database can't do, so for
// shows Romantic and Scary drop out and Gripping is Crime or Mystery.
// Moods add titles (Funny or Gripping); type and services narrow.

/** @typedef {import('./moodGenres.js').Mood} Mood */
/** @typedef {'all' | 'movie' | 'tv'} MoodKind */
/**
 * @typedef {object} MoodChoice
 * @property {MoodKind} kind
 * @property {Mood[]} moods
 * @property {boolean} services  Only titles on the starter's services.
 */
/**
 * @typedef {object} SessionFilters  watch_together_sessions.filters, as stored.
 * @property {string} by  Who started the session (their services, if services is on).
 * @property {'movie' | 'tv' | null} media_type
 * @property {string[]} moods
 * @property {boolean} services
 */

/** @type {MoodChoice} */
export const NO_MOOD = Object.freeze({ kind: 'all', moods: [], services: false });

/** @param {Mood} mood @param {'movie' | 'tv'} mediaType */
const storedGenres = (mood, mediaType) => (MOOD_GENRES[mood]?.[mediaType] || []).filter(id => id > 0);

/**
 * The mood chips that can find anything for this kind: every mood for movies,
 * not Romantic or Scary for shows only.
 * @param {MoodKind} kind
 * @returns {Mood[]}
 */
export function moodsFor(kind) {
  const types = kind === 'all' ? ['movie', 'tv'] : [kind];
  return MOODS.filter(m => types.some(t => storedGenres(m, /** @type {'movie'|'tv'} */ (t)).length > 0));
}

/**
 * @param {WatchTogetherTitle} t
 * @param {MoodChoice} choice
 * @param {Set<number>} providers
 * @param {{ ignoreMoods?: boolean }} [opts]
 */
function fitsChoice(t, choice, providers, { ignoreMoods = false } = {}) {
  if (choice.kind !== 'all' && t.media_type !== choice.kind) return false;
  if (choice.services && !(t.provider_ids || []).some(id => providers.has(id))) return false;
  if (ignoreMoods || !choice.moods.length) return true;
  const type = t.media_type === 'tv' ? 'tv' : 'movie';
  const genres = t.genre_ids || [];
  return choice.moods.some(m => storedGenres(m, type).some(id => genres.includes(id)));
}

/**
 * The shared titles a mood choice keeps.
 * @param {WatchTogetherTitle[]} titles
 * @param {MoodChoice} choice
 * @param {number[]} providerIds  The viewer's services (pickerProviderIds).
 */
export function filterByMood(titles, choice, providerIds) {
  const providers = new Set(providerIds);
  return titles.filter(t => fitsChoice(t, choice, providers));
}

/**
 * How many titles each mood chip would keep on its own, given the type and
 * services already chosen. A chip at 0 is shown but can't be picked.
 * @param {WatchTogetherTitle[]} titles
 * @param {MoodChoice} choice
 * @param {number[]} providerIds
 * @returns {Record<string, number>}
 */
export function moodCounts(titles, choice, providerIds) {
  const providers = new Set(providerIds);
  const base = titles.filter(t => fitsChoice(t, choice, providers, { ignoreMoods: true }));
  /** @type {Record<string, number>} */
  const counts = {};
  for (const m of moodsFor(choice.kind)) {
    counts[m] = base.filter(t => fitsChoice(t, { ...choice, moods: [m] }, providers)).length;
  }
  return counts;
}

/**
 * When a choice keeps nothing: the single changes that bring titles back,
 * most titles first. Only changes that help are listed.
 * @param {WatchTogetherTitle[]} titles
 * @param {MoodChoice} choice
 * @param {number[]} providerIds
 * @returns {{ change: 'services' | 'moods' | 'kind', choice: MoodChoice, count: number }[]}
 */
export function moodFixes(titles, choice, providerIds) {
  /** @type {{ change: 'services' | 'moods' | 'kind', choice: MoodChoice }[]} */
  const options = [];
  if (choice.services) options.push({ change: 'services', choice: { ...choice, services: false } });
  if (choice.moods.length) options.push({ change: 'moods', choice: { ...choice, moods: [] } });
  if (choice.kind !== 'all') options.push({ change: 'kind', choice: { ...choice, kind: 'all' } });
  return options
    .map(o => ({ ...o, count: filterByMood(titles, o.choice, providerIds).length }))
    .filter(o => o.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Toggle one mood chip.
 * @param {MoodChoice} choice @param {Mood} mood
 * @returns {MoodChoice}
 */
export function toggleMoodChoice(choice, mood) {
  const on = choice.moods.includes(mood);
  return { ...choice, moods: on ? choice.moods.filter(m => m !== mood) : [...choice.moods, mood] };
}

/**
 * Switch Movies / TV / Both, dropping moods that can't find anything there
 * (Romantic and Scary for shows).
 * @param {MoodChoice} choice @param {MoodKind} kind
 * @returns {MoodChoice}
 */
export function setMoodKind(choice, kind) {
  const allowed = moodsFor(kind);
  return { ...choice, kind, moods: choice.moods.filter(m => allowed.includes(m)) };
}

/**
 * What start_watch_together_session_filtered expects. Genres are every
 * stored genre behind the chosen moods for the chosen type(s); the server
 * keeps a title that has any of them.
 * @param {MoodChoice} choice
 * @param {number[]} providerIds
 */
export function sessionFilterPayload(choice, providerIds) {
  const types = choice.kind === 'all' ? ['movie', 'tv'] : [choice.kind];
  const genreIds = [...new Set(choice.moods.flatMap(m => types.flatMap(t => storedGenres(m, /** @type {'movie'|'tv'} */ (t)))))];
  return {
    media_type: choice.kind === 'all' ? null : choice.kind,
    genre_ids: genreIds,
    provider_ids: choice.services ? [...new Set(providerIds)] : [],
    moods: choice.moods.filter(m => moodsFor(choice.kind).includes(m)),
  };
}

/**
 * The labels for what a session was started with, for both people:
 * "Movies", "Funny", "My services" (or "Sam’s services" for the other person).
 * Empty for a session started without a mood.
 * @param {SessionFilters | null | undefined} filters
 * @param {{ viewerId?: string | null, starterName?: string }} who
 * @returns {string[]}
 */
export function sessionFilterLabels(filters, { viewerId = null, starterName = '' } = {}) {
  if (!filters) return [];
  const C = TONIGHT_PICKER.chips;
  /** @type {string[]} */
  const labels = [];
  if (filters.media_type === 'movie') labels.push(C.movies);
  if (filters.media_type === 'tv') labels.push(C.shows);
  for (const m of filters.moods || []) {
    // Own keys only: a stored name like "toString" must not find a built-in.
    if (Object.hasOwn(C.moods, m)) labels.push(/** @type {Record<string, string>} */ (C.moods)[m]);
  }
  if (filters.services) {
    labels.push(!viewerId || filters.by === viewerId ? TONIGHT_PICKER.summary.services : WATCH_TOGETHER.mood.theirServices(starterName));
  }
  return labels;
}

/**
 * Properties for watch_together_session_started, so the dashboard can tell
 * mood-step starts from plain ones.
 * @param {MoodChoice | null | undefined} choice
 * @param {number} deckSize
 */
export function sessionStartProps(choice, deckSize) {
  if (!choice) return { with_mood: false };
  return {
    with_mood: true,
    mood_count: choice.moods.length,
    media_type: choice.kind,
    services: choice.services,
    deck_size: deckSize,
  };
}

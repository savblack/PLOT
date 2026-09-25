// Watch together (Premium): pure rules shared by web and mobile. The server is
// the authority (supabase/migrations/20260925120000_watch_together.sql); these
// helpers only decide what to show. Design: docs/design/watch-together/README.md.

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

/** Requests expire after this many days (mirrors the migration). */
export const REQUEST_EXPIRY_DAYS = 30;

/**
 * Which state the invite tile on someone's profile shows.
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
 * Whether the tile may show an overlap count. The server already withholds it
 * for private profiles before pairing; this keeps the UI from implying one.
 *
 * @param {TileMode} mode
 * @param {number | null | undefined} count
 */
export function tileShowsCount(mode, count) {
  return typeof count === 'number' && (mode === 'free' || mode === 'public' || mode === 'paired');
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
 * @returns {'premium_required' | 'not_allowed' | 'generic'}
 */
export function watchTogetherErrorCode(error) {
  const message = error?.message || '';
  if (message.includes('premium_required')) return 'premium_required';
  if (message.includes('not_allowed')) return 'not_allowed';
  return 'generic';
}

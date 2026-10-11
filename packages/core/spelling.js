// Region-linked UI spelling for strings that already ship. Do not add entries
// or new call sites. New user-facing copy is American English (see AGENTS.md),
// except legal pages, which stay as written. This dictionary remains so the
// existing favorite/color switch keeps working until that sweep is decided.
//
// The data layer stays whatever it already is regardless of copy (e.g. the
// user_favourites table, source_type = 'favourite', the profile_sections
// 'favourites' key, and the useFavorites/isFavorite identifiers) — only
// user-facing copy varies. The region comes from the profile the user sets
// during onboarding (profiles.region — useApp().profile on web,
// useAppData().profile on mobile). When it's unknown (logged out,
// pre-onboarding) we fall back to the US default.
//
// This module is the single source for both apps. It replaced a pair of
// hand-kept copies (apps/web/src/utils/spelling.js and
// apps/mobile/lib/spelling.ts) whose word data stayed in sync but whose
// exported APIs had diverged.

// Commonwealth-English regions get the UK spelling. Everyone else — the US and
// the non-English regions, where the UI is English anyway — gets the US default.
const BRITISH_SPELLING_REGIONS = new Set(['GB', 'AU', 'NZ', 'CA', 'IE', 'IN', 'SG']);

/**
 * @param {string | null | undefined} region
 * @returns {boolean}
 */
export function usesBritishSpelling(region) {
  return BRITISH_SPELLING_REGIONS.has(String(region || '').toUpperCase());
}

// Each entry is a concept; each form is [US spelling, UK spelling]. None of
// the entries below favorite are in use yet — they're here so the next piece
// of copy that needs one of these words is a lookup, not a hardcoded string.
const SPELLING = {
  favorite: {
    noun:        ['Favorite',   'Favourite'],
    nounLower:   ['favorite',   'favourite'],
    plural:      ['Favorites',  'Favourites'],
    pluralLower: ['favorites',  'favourites'],
    past:        ['favorited',  'favourited'],
    pastTitle:   ['Favorited',  'Favourited'],
    un:          ['Unfavorite', 'Unfavourite'],
  },
  color: {
    noun:      ['Color', 'Colour'],
    nounLower: ['color', 'colour'],
    plural:    ['Colors', 'Colours'],
  },
  center: {
    noun:      ['Center', 'Centre'],
    nounLower: ['center', 'centre'],
  },
  organize: {
    verb:      ['organize',   'organise'],
    verbTitle: ['Organize',   'Organise'],
    ing:       ['organizing', 'organising'],
    ed:        ['organized',  'organised'],
  },
  customize: {
    verb:      ['customize',   'customise'],
    verbTitle: ['Customize',   'Customise'],
    ing:       ['customizing', 'customising'],
    ed:        ['customized',  'customised'],
  },
  personalize: {
    verb:      ['personalize',   'personalise'],
    verbTitle: ['Personalize',   'Personalise'],
    ing:       ['personalizing', 'personalising'],
    ed:        ['personalized',  'personalised'],
  },
  catalog: {
    noun:      ['Catalog', 'Catalogue'],
    nounLower: ['catalog', 'catalogue'],
  },
  gray: {
    noun:      ['Gray', 'Grey'],
    nounLower: ['gray', 'grey'],
  },
  behavior: {
    noun:      ['Behavior', 'Behaviour'],
    nounLower: ['behavior', 'behaviour'],
  },
  canceled: {
    ed:      ['canceled',  'cancelled'],
    edTitle: ['Canceled',  'Cancelled'],
    ing:     ['canceling', 'cancelling'],
  },
};

/**
 * Every form of `key`'s word, spelled for the given region.
 *
 * @param {keyof typeof SPELLING} key
 * @param {string | null | undefined} region
 * @returns {Record<string, string>}
 */
export function regionalWords(key, region) {
  const uk = usesBritishSpelling(region);
  const forms = SPELLING[key];
  /** @type {Record<string, string>} */
  const out = {};
  for (const form in forms) out[form] = forms[form][uk ? 1 : 0];
  return out;
}

/**
 * @typedef {object} FavoriteWords
 * @property {string} noun        "Favorite" / "Favourite"
 * @property {string} nounLower   "favorite" / "favourite"
 * @property {string} plural      "Favorites" / "Favourites"
 * @property {string} pluralLower "favorites" / "favourites"
 * @property {string} past        "favorited" / "favourited"
 * @property {string} pastTitle   "Favorited" / "Favourited"
 * @property {string} un          "Unfavorite" / "Unfavourite"
 */

/**
 * The one concept both apps actually render today. Kept as a named helper
 * because it's the call-site name used throughout web and mobile.
 *
 * @param {string | null | undefined} region
 * @returns {FavoriteWords}
 */
export function favoriteWords(region) {
  return /** @type {FavoriteWords} */ (regionalWords('favorite', region));
}

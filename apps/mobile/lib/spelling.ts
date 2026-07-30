// Region-linked UI spelling — mirrors the web helper (apps/web/src/utils/spelling.js).
// Add an entry to SPELLING below when a piece of copy needs a US/UK variant;
// everything else in the app's copy has been cross-checked and is spelled
// identically in both dialects, so it needs no entry until that changes.
//
// The data layer stays whatever it already is regardless of copy (e.g. the
// user_favourites table, source_type = 'favourite', the profile_sections
// 'favourites' key, and the useFavorites/isFavorite identifiers) — only
// user-facing copy varies. The region comes from the profile the user sets
// during onboarding (profiles.region, available via useAppData().profile).
// When it's unknown (logged out, pre-onboarding) we fall back to the US default.

// Commonwealth-English regions get the UK spelling. Everyone else — the US and
// the non-English regions, where the UI is English anyway — gets the US default.
const BRITISH_SPELLING_REGIONS = new Set(['GB', 'AU', 'NZ', 'CA', 'IE', 'IN', 'SG']);

export function usesBritishSpelling(region?: string | null): boolean {
  return BRITISH_SPELLING_REGIONS.has(String(region || '').toUpperCase());
}

type Forms<K extends string> = Record<K, [us: string, uk: string]>;

function regionalWords<K extends string>(forms: Forms<K>, region?: string | null): { [key in K]: string } {
  const uk = usesBritishSpelling(region);
  const out = {} as { [key in K]: string };
  for (const form in forms) out[form] = forms[form][uk ? 1 : 0];
  return out;
}

// None of the blocks below favorite are in use yet — they're here so the next
// piece of copy that needs one of these words is a lookup, not a hardcoded string.

const FAVORITE_FORMS = {
  noun:        ['Favorite',   'Favourite'],
  nounLower:   ['favorite',   'favourite'],
  plural:      ['Favorites',  'Favourites'],
  pluralLower: ['favorites',  'favourites'],
  past:        ['favorited',  'favourited'],
  pastTitle:   ['Favorited',  'Favourited'],
  un:          ['Unfavorite', 'Unfavourite'],
} satisfies Forms<string>;

export type FavoriteWords = { [K in keyof typeof FAVORITE_FORMS]: string };

// Every form of the word the UI needs, spelled for the given region.
export function favoriteWords(region?: string | null): FavoriteWords {
  return regionalWords(FAVORITE_FORMS, region);
}

const COLOR_FORMS = {
  noun:      ['Color', 'Colour'],
  nounLower: ['color', 'colour'],
  plural:    ['Colors', 'Colours'],
} satisfies Forms<string>;

export function colorWords(region?: string | null) {
  return regionalWords(COLOR_FORMS, region);
}

const CENTER_FORMS = {
  noun:      ['Center', 'Centre'],
  nounLower: ['center', 'centre'],
} satisfies Forms<string>;

export function centerWords(region?: string | null) {
  return regionalWords(CENTER_FORMS, region);
}

const ORGANIZE_FORMS = {
  verb:      ['organize',   'organise'],
  verbTitle: ['Organize',   'Organise'],
  ing:       ['organizing', 'organising'],
  ed:        ['organized',  'organised'],
} satisfies Forms<string>;

export function organizeWords(region?: string | null) {
  return regionalWords(ORGANIZE_FORMS, region);
}

const CUSTOMIZE_FORMS = {
  verb:      ['customize',   'customise'],
  verbTitle: ['Customize',   'Customise'],
  ing:       ['customizing', 'customising'],
  ed:        ['customized',  'customised'],
} satisfies Forms<string>;

export function customizeWords(region?: string | null) {
  return regionalWords(CUSTOMIZE_FORMS, region);
}

const PERSONALIZE_FORMS = {
  verb:      ['personalize',   'personalise'],
  verbTitle: ['Personalize',   'Personalise'],
  ing:       ['personalizing', 'personalising'],
  ed:        ['personalized',  'personalised'],
} satisfies Forms<string>;

export function personalizeWords(region?: string | null) {
  return regionalWords(PERSONALIZE_FORMS, region);
}

const CATALOG_FORMS = {
  noun:      ['Catalog', 'Catalogue'],
  nounLower: ['catalog', 'catalogue'],
} satisfies Forms<string>;

export function catalogWords(region?: string | null) {
  return regionalWords(CATALOG_FORMS, region);
}

const GRAY_FORMS = {
  noun:      ['Gray', 'Grey'],
  nounLower: ['gray', 'grey'],
} satisfies Forms<string>;

export function grayWords(region?: string | null) {
  return regionalWords(GRAY_FORMS, region);
}

const BEHAVIOR_FORMS = {
  noun:      ['Behavior', 'Behaviour'],
  nounLower: ['behavior', 'behaviour'],
} satisfies Forms<string>;

export function behaviorWords(region?: string | null) {
  return regionalWords(BEHAVIOR_FORMS, region);
}

const CANCELED_FORMS = {
  ed:      ['canceled',  'cancelled'],
  edTitle: ['Canceled',  'Cancelled'],
  ing:     ['canceling', 'cancelling'],
} satisfies Forms<string>;

export function canceledWords(region?: string | null) {
  return regionalWords(CANCELED_FORMS, region);
}

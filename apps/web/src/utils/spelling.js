// Region-linked UI spelling. Add an entry to SPELLING below when a piece of
// copy needs a US/UK variant; everything else in the app's copy has been
// cross-checked and is spelled identically in both dialects, so it needs no
// entry until that changes.
//
// The data layer stays whatever it already is regardless of copy (e.g. the
// user_favourites table, source_type = 'favourite', the profile_sections
// 'favourites' key, and the useFavorites/isFavorite identifiers) — only
// user-facing copy varies. The region comes from the profile the user sets
// during onboarding (profiles.region, available via useApp().profile). When
// it's unknown (logged out, pre-onboarding) we fall back to the US default.

// Commonwealth-English regions get the UK spelling. Everyone else — the US and
// the non-English regions, where the UI is English anyway — gets the US default.
const BRITISH_SPELLING_REGIONS = new Set(['GB', 'AU', 'NZ', 'CA', 'IE', 'IN', 'SG']);

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
    ed:        ['canceled',  'cancelled'],
    edTitle:   ['Canceled',  'Cancelled'],
    ing:       ['canceling', 'cancelling'],
  },
};

// Every form of `key`'s word, spelled for the given region.
export function regionalWords(key, region) {
  const uk = usesBritishSpelling(region);
  const forms = SPELLING[key];
  const out = {};
  for (const form in forms) out[form] = forms[form][uk ? 1 : 0];
  return out;
}

// Kept as the call-site name in use throughout the app.
export function favoriteWords(region) {
  return regionalWords('favorite', region);
}

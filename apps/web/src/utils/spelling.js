// Region-linked UI spelling for the "favorite(s)" concept.
//
// The data layer stays British everywhere (user_favourites table,
// source_type = 'favourite', the profile_sections 'favourites' key, and the
// useFavorites/isFavorite identifiers) — only user-facing copy varies. The
// region comes from the profile the user sets during onboarding
// (profiles.region, available via useApp().profile). When it's unknown
// (logged out, pre-onboarding) we fall back to the US default.

// Commonwealth-English regions spell it "favourite". Everyone else — the US and
// the non-English regions, where the UI is English anyway — gets the US default.
const BRITISH_SPELLING_REGIONS = new Set(['GB', 'AU', 'NZ', 'CA', 'IE', 'IN', 'SG']);

export function usesBritishSpelling(region) {
  return BRITISH_SPELLING_REGIONS.has(String(region || '').toUpperCase());
}

// Every form of the word the UI needs, spelled for the given region.
export function favoriteWords(region) {
  const uk = usesBritishSpelling(region);
  return {
    noun:        uk ? 'Favourite'   : 'Favorite',
    nounLower:   uk ? 'favourite'   : 'favorite',
    plural:      uk ? 'Favourites'  : 'Favorites',
    pluralLower: uk ? 'favourites'  : 'favorites',
    past:        uk ? 'favourited'  : 'favorited',
    pastTitle:   uk ? 'Favourited'  : 'Favorited',
    un:          uk ? 'Unfavourite' : 'Unfavorite',
  };
}

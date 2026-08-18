// Resolving a Plex library entry to a TMDB title.
//
// WHY THIS IS STRICT
// The previous matcher ended with `return candidates[0] || null` — TMDB's most
// popular search hit for the title, whatever it was. A Plex entry whose year is
// missing or whose name is generic ("Ghosts", "The Office", "Alone") therefore
// resolved to a confident-looking match for an unrelated title, and that wrong
// tmdb_id was written into list_items and history under match_state 'matched'.
// A watchlist that quietly fills with the wrong films is worse than one that
// reports a few titles it could not place.
//
// So: an id wins over a guess, a guess must agree on the title, and an ambiguous
// guess is not a match. Anything unresolved comes back null, and the caller marks
// it 'needs_review' rather than writing it.

const ARTICLES = /^(the|a|an)\s+/

/**
 * Comparable form of a title: case-folded, accent-stripped, punctuation-free,
 * leading article dropped, whitespace collapsed. "Amélie" and "amelie" match;
 * "The Office" and "Office" match; "Alone" and "Alone Together" do not.
 */
export function normalizeTitle(value) {
  const base = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return base.replace(ARTICLES, '')
}

/** First four-digit year in a value, or null. */
export function yearFrom(value) {
  const match = String(value ?? '').match(/\d{4}/)
  return match ? Number(match[0]) : null
}

/** TMDB's title field differs by media type. */
export function titleFrom(result) {
  return result?.title ?? result?.name ?? ''
}

/**
 * The TMDB id inside a Plex guid, if it carries one.
 *
 * Legacy agents put it in the guid attribute directly
 * ("com.plexapp.agents.themoviedb://603?lang=en"); the current agent uses opaque
 * "plex://movie/…" guids and lists real ids in nested <Guid id="tmdb://603"/>
 * elements instead. Both forms are exact — no search, no ambiguity — so they are
 * always preferred over matching by name.
 *
 * @param {string | null | undefined} guid
 * @returns {number | null}
 */
export function tmdbIdFromGuid(guid) {
  const match = String(guid ?? '').match(/(?:themoviedb|tmdb):\/\/(\d+)/i)
  if (!match) return null

  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * First TMDB id among a Plex entry's guids (nested <Guid> ids plus the guid
 * attribute). imdb:// and tvdb:// entries are ignored — mapping those would need
 * another lookup, and a wrong mapping is the thing being fixed.
 *
 * @param {(string | null | undefined)[]} guids
 * @returns {number | null}
 */
export function tmdbIdFromGuids(guids) {
  for (const guid of guids || []) {
    const id = tmdbIdFromGuid(guid)
    if (id) return id
  }
  return null
}

/**
 * Pick the TMDB search result that is actually this entry, or nothing.
 *
 * @param {Record<string, any>[]} results TMDB /search/multi results.
 * @param {{ title?: string, media_type?: string, type?: string, year?: unknown,
 *           release_date?: unknown, first_air_date?: unknown }} entry
 * @returns {Record<string, any> | null}
 */
export function selectTmdbMatch(results, entry) {
  const wantedType = entry?.media_type === 'movie' || entry?.media_type === 'tv'
    ? entry.media_type
    : entry?.type === 'movie' || entry?.type === 'tv' ? entry.type : null
  const wantedTitle = normalizeTitle(entry?.title)
  if (!wantedTitle) return null

  const wantedYear = yearFrom(entry?.year ?? entry?.release_date ?? entry?.first_air_date)

  // Same title, right kind of thing. Everything below narrows this set; nothing
  // outside it is ever returned, which is the whole point.
  const sameTitle = (results || []).filter(result => {
    if (result?.media_type !== 'movie' && result?.media_type !== 'tv') return false
    if (wantedType && result.media_type !== wantedType) return false
    return normalizeTitle(titleFrom(result)) === wantedTitle
  })

  if (sameTitle.length === 0) return null

  // Exactly one title of this name and kind on TMDB: unambiguous, so a year
  // disagreement doesn't matter — Plex year metadata is user-editable and often
  // wrong, while an exact title match against a single candidate is not the
  // failure mode this guards against.
  if (sameTitle.length === 1) return sameTitle[0]

  // Several releases share the name, so only the year can separate them.
  if (!wantedYear) return null

  const sameYear = sameTitle.filter(r => yearFrom(r.release_date ?? r.first_air_date) === wantedYear)
  if (sameYear.length === 1) return sameYear[0]
  // Two releases of the same name in the same year: no way to choose.
  if (sameYear.length > 1) return null

  // Plex and TMDB disagree by a year often enough (festival vs general release,
  // a season straddling new year) that ±1 is still the same title — but only
  // when exactly one candidate is that close.
  const adjacent = sameTitle.filter(r => {
    const year = yearFrom(r.release_date ?? r.first_air_date)
    return year != null && Math.abs(year - wantedYear) <= 1
  })
  return adjacent.length === 1 ? adjacent[0] : null
}

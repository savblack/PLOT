// Custom TMDB artwork. A choice is a file path, never a URL. The apps apply
// it only while the account is Premium. Public pages stay on the TMDB default.

/** Stored when the choice is not a season. Season 0 remains Specials. */
export const ARTWORK_SEASON_NONE = -1;

const OPTION_LIMIT = 30;

const KINDS = {
  movie: new Set(['poster', 'backdrop', 'logo']),
  tv: new Set(['poster', 'backdrop', 'logo']),
  season: new Set(['poster']),
  person: new Set(['profile']),
};

/**
 * @param {unknown} path
 * @returns {boolean}
 */
export function isTmdbFilePath(path) {
  if (typeof path !== 'string' || path.length < 2 || path.length > 300) return false;
  if (!path.startsWith('/') || path.includes('..') || path.includes('://') || path.includes('\\')) return false;
  return !/\s/.test(path);
}

/**
 * @param {string} subjectType
 * @param {number} tmdbId
 * @param {number} seasonNumber
 * @param {string} kind
 */
export function artworkKey(subjectType, tmdbId, seasonNumber, kind) {
  const season = subjectType === 'season' ? Number(seasonNumber) : ARTWORK_SEASON_NONE;
  return `${subjectType}:${Number(tmdbId)}:${season}:${kind}`;
}

/**
 * @param {{ subjectType?: string, tmdbId?: number, seasonNumber?: number, kind?: string } | null | undefined} choice
 * @returns {{ subject_type: string, tmdb_id: number, season_number: number, kind: string } | null}
 */
export function artworkSubject(choice) {
  const subjectType = choice?.subjectType;
  const kind = choice?.kind;
  const tmdbId = Number(choice?.tmdbId);
  if (!subjectType || !KINDS[subjectType]?.has(kind)) return null;
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return null;
  let seasonNumber = ARTWORK_SEASON_NONE;
  if (subjectType === 'season') {
    seasonNumber = Number(choice?.seasonNumber);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return null;
  }
  return { subject_type: subjectType, tmdb_id: tmdbId, season_number: seasonNumber, kind };
}

/**
 * @param {string} userId
 * @param {{ subjectType?: string, tmdbId?: number, seasonNumber?: number, kind?: string, filePath?: string }} choice
 */
export function artworkRecord(userId, choice) {
  const subject = artworkSubject(choice);
  if (!userId || !subject || !isTmdbFilePath(choice?.filePath)) return null;
  return {
    user_id: userId,
    ...subject,
    file_path: choice.filePath,
    updated_at: new Date().toISOString(),
  };
}

/**
 * @param {Array<{ subject_type?: string, tmdb_id?: number, season_number?: number, kind?: string, file_path?: string }> | null | undefined} rows
 * @returns {Record<string, string>}
 */
export function artworkMap(rows) {
  const map = {};
  for (const row of rows || []) {
    if (!row || !isTmdbFilePath(row.file_path) || !KINDS[row.subject_type]?.has(row.kind)) continue;
    map[artworkKey(row.subject_type, row.tmdb_id, row.season_number, row.kind)] = row.file_path;
  }
  return map;
}

/**
 * @param {Record<string, string> | null | undefined} map
 * @param {string} subjectType
 * @param {number} tmdbId
 * @param {string} kind
 * @param {number} [seasonNumber]
 * @returns {string | null}
 */
export function artworkPath(map, subjectType, tmdbId, kind, seasonNumber) {
  if (!map || !subjectType || !kind) return null;
  const id = Number(tmdbId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return map[artworkKey(subjectType, id, seasonNumber, kind)] ?? null;
}

function integerAtLeastZero(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

/**
 * @param {any} item
 * @returns {{ mediaType: 'movie' | 'tv' | 'person', id: number, season: number | null } | null}
 */
export function artworkSubjectOf(item) {
  if (!item || typeof item !== 'object') return null;
  const id = Number(item.tmdb_id ?? item.tmdbId ?? item.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const raw = item.media_type || item.mediaType;
  const season = integerAtLeastZero(
    item.season_number ?? item.seasonNumber ?? item.current_season ?? item.season ?? item.episode?.season_number,
  );
  let mediaType = raw === 'movie' || raw === 'tv' || raw === 'person' ? raw : null;
  if (!mediaType && season != null) mediaType = 'tv';
  if (!mediaType) return null;
  return { mediaType, id, season: mediaType === 'tv' ? season : null };
}

/**
 * Replace poster, backdrop, or profile paths on a render item. The original
 * object is returned when nothing is saved.
 * @param {any} item
 * @param {Record<string, string> | null | undefined} map
 */
export function applyArtwork(item, map) {
  if (!item || !map) return item;
  const subject = artworkSubjectOf(item);
  if (!subject) return item;
  if (subject.mediaType === 'person') {
    const photo = artworkPath(map, 'person', subject.id, 'profile');
    if (!photo) return item;
    return { ...item, profile_path: photo, profilePath: photo };
  }
  let poster = null;
  if (subject.mediaType === 'tv' && subject.season != null) {
    poster = artworkPath(map, 'season', subject.id, 'poster', subject.season);
  }
  if (!poster) poster = artworkPath(map, subject.mediaType, subject.id, 'poster');
  const backdrop = artworkPath(map, subject.mediaType, subject.id, 'backdrop');
  if (!poster && !backdrop) return item;
  return {
    ...item,
    ...(poster ? { poster_path: poster, posterPath: poster } : {}),
    ...(backdrop ? { backdrop_path: backdrop, backdropPath: backdrop } : {}),
  };
}

/** @param {any} item */
export function displayPosterPath(item) {
  return item?.poster_path || item?.posterPath || null;
}

/** @param {any} item */
export function displayBackdropPath(item) {
  return item?.backdrop_path || item?.backdropPath || null;
}

/**
 * People-feed rows store season 0 for a film or a whole series.
 * That sentinel is not the Specials season, so it must not select a season poster.
 * @param {any} item
 */
export function feedDisplayItem(item) {
  if (!item || item.kind == null || item.kind === 'season') return item;
  if (item.season == null && item.season_number == null) return item;
  const copy = { ...item };
  delete copy.season;
  delete copy.season_number;
  return copy;
}

/**
 * Highest voted TMDB images first. Paths that are not TMDB files are dropped.
 * @param {Array<{ file_path?: string, vote_average?: number, vote_count?: number }> | null | undefined} images
 */
export function sortArtworkOptions(images) {
  return (Array.isArray(images) ? images : [])
    .filter(image => isTmdbFilePath(image?.file_path))
    .sort((a, b) => (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0)
      || (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0));
}

const IMAGE_FIELDS = { poster: 'posters', backdrop: 'backdrops', logo: 'logos' };

/**
 * The groups the sheet shows, already sorted. Season posters are included
 * only for a TV season, including Specials.
 * @param {{ mediaType: string, tmdbId: number, seasonNumber?: number, titleImages?: any, seasonImages?: any, personImages?: any }} source
 */
export function artworkCatalog({ mediaType, tmdbId, seasonNumber, titleImages, seasonImages, personImages }) {
  const id = Number(tmdbId);
  if (mediaType === 'person') {
    return [{
      key: 'profile',
      labelKey: 'photos',
      subjectType: 'person',
      tmdbId: id,
      seasonNumber: ARTWORK_SEASON_NONE,
      kind: 'profile',
      options: sortArtworkOptions(personImages?.profiles).slice(0, OPTION_LIMIT),
    }];
  }
  const subjectType = mediaType === 'tv' ? 'tv' : 'movie';
  const sections = ['poster', 'backdrop', 'logo'].map(kind => ({
    key: kind,
    labelKey: kind === 'poster' ? 'posters' : kind === 'backdrop' ? 'backdrops' : 'logos',
    subjectType,
    tmdbId: id,
    seasonNumber: ARTWORK_SEASON_NONE,
    kind,
    options: sortArtworkOptions(titleImages?.[IMAGE_FIELDS[kind]]).slice(0, OPTION_LIMIT),
  }));
  const season = Number(seasonNumber);
  if (mediaType === 'tv' && Number.isInteger(season) && season >= 0) {
    sections.push({
      key: 'season-poster',
      labelKey: 'seasonPosters',
      subjectType: 'season',
      tmdbId: id,
      seasonNumber: season,
      kind: 'poster',
      options: sortArtworkOptions(seasonImages?.posters).slice(0, OPTION_LIMIT),
    });
  }
  return sections;
}

async function readImages(request) {
  try {
    return await request;
  } catch {
    return null;
  }
}

/**
 * @param {{ images: Function, seasonImages: Function, personImages: Function }} client
 * @param {{ mediaType: string, tmdbId: number, seasonNumber?: number }} subject
 */
export async function loadArtworkCatalog(client, subject) {
  const mediaType = subject?.mediaType;
  const tmdbId = Number(subject?.tmdbId);
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return { sections: [], failed: true };
  if (mediaType === 'person') {
    const personImages = await readImages(client.personImages(tmdbId));
    return { sections: artworkCatalog({ mediaType, tmdbId, personImages }), failed: personImages == null };
  }
  if (mediaType !== 'movie' && mediaType !== 'tv') return { sections: [], failed: true };
  const season = Number(subject.seasonNumber);
  const wantsSeason = mediaType === 'tv' && Number.isInteger(season) && season >= 0;
  const [titleImages, seasonImages] = await Promise.all([
    readImages(client.images(mediaType, tmdbId)),
    wantsSeason ? readImages(client.seasonImages(tmdbId, season)) : Promise.resolve(null),
  ]);
  return {
    sections: artworkCatalog({ mediaType, tmdbId, seasonNumber: season, titleImages, seasonImages }),
    failed: titleImages == null && (!wantsSeason || seasonImages == null),
  };
}

// Regional age rating and content advisories from TMDB.
// Movies read release_dates. Series read content_ratings. Nothing is invented
// when the account's region has no certification.

const RELEASE_TYPE_ORDER = [3, 2, 4, 1, 5, 6];

function certificationOf(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function descriptorsFor(entries, certification, field) {
  const seen = new Set();
  const descriptors = [];
  for (const entry of entries) {
    if (certificationOf(entry?.[field]) !== certification) continue;
    const list = Array.isArray(entry?.descriptors) ? entry.descriptors : [];
    for (const raw of list) {
      const text = String(raw ?? '').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      descriptors.push(text);
    }
  }
  return descriptors;
}

/**
 * @param {{ results?: Array<{ iso_3166_1?: string, release_dates?: Array<{ type?: number, certification?: string, descriptors?: string[] }> }> } | null | undefined} releaseDates
 * @param {string} region
 * @returns {{ certification: string, descriptors: string[] } | null}
 */
export function movieGuide(releaseDates, region) {
  const dates = releaseDates?.results?.find(entry => entry.iso_3166_1 === region)?.release_dates || [];
  const certified = dates.filter(entry => certificationOf(entry.certification));
  if (!certified.length) return null;
  let chosen = null;
  for (const type of RELEASE_TYPE_ORDER) {
    chosen = certified.find(entry => entry.type === type);
    if (chosen) break;
  }
  chosen = chosen || certified[0];
  const certification = certificationOf(chosen.certification);
  return { certification, descriptors: descriptorsFor(dates, certification, 'certification') };
}

/**
 * @param {{ results?: Array<{ iso_3166_1?: string, rating?: string, descriptors?: string[] }> } | null | undefined} contentRatings
 * @param {string} region
 * @returns {{ certification: string, descriptors: string[] } | null}
 */
export function tvGuide(contentRatings, region) {
  const entry = contentRatings?.results?.find(item => item.iso_3166_1 === region);
  const certification = certificationOf(entry?.rating);
  if (!certification) return null;
  return { certification, descriptors: descriptorsFor([entry], certification, 'rating') };
}

/**
 * Official meaning for a certification, from /certification/{movie|tv}/list.
 * @returns {string | null}
 */
export function meaningFor(list, region, certification) {
  const rows = list?.certifications?.[region];
  if (!Array.isArray(rows)) return null;
  const row = rows.find(item => certificationOf(item?.certification) === certification);
  const meaning = String(row?.meaning ?? '').trim();
  return meaning || null;
}

const lists = new Map();

export function clearCertificationLists() {
  lists.clear();
}

/**
 * @param {{ movieCertifications: () => Promise<any>, tvCertifications: () => Promise<any> }} client
 * @param {'movie' | 'tv'} mediaType
 * @param {string} region
 * @param {string} certification
 * @returns {Promise<string | null>}
 */
export function loadCertificationMeaning(client, mediaType, region, certification) {
  if (!certification || (mediaType !== 'movie' && mediaType !== 'tv')) return Promise.resolve(null);
  if (!lists.has(mediaType)) {
    const request = mediaType === 'tv' ? client.tvCertifications() : client.movieCertifications();
    lists.set(mediaType, Promise.resolve(request).then(data => data || null).catch(() => null));
  }
  return lists.get(mediaType).then(list => {
    if (!list) lists.delete(mediaType);
    return meaningFor(list, region, certification);
  });
}

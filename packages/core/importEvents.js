// Event identity is separate from history's title key. Never deduplicate two
// watches merely because they describe the same title or fall on the same day.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { FREE_CUSTOM_LIST_CAP } from './premium.js';

export function requiresEpisodeIdentity(record) {
  return ['netflix','prime','disney','max','apple'].includes(record.source) && record.mediaType === 'tv' &&
    (record.seasonNumber == null || record.episodeNumber == null);
}

/**
 * @param {{ source: string, account: string, eventId?: string | number | null,
 * fileDigest?: string, recordIndex?: number }} record
 * @returns {string}
 */
export function importEventIdentity(record) {
  if (!record.source || !record.account) throw new Error('Missing source identity');
  if (record.eventId != null && String(record.eventId).length) {
    return JSON.stringify([record.source, record.account, 'event', String(record.eventId)]);
  }
  if (!/^[a-f0-9]{64}$/i.test(record.fileDigest || '') ||
      !Number.isSafeInteger(record.recordIndex) || record.recordIndex < 0) {
    throw new Error('A SHA-256 file digest and original record index are required');
  }
  return JSON.stringify([record.source, record.account, 'file', record.fileDigest.toLowerCase(), record.recordIndex]);
}

/**
 * Only confirmed IDs belong in this record. Candidate matches remain in the
 * review model until the user chooses one. Unknown dates remain null.
 * @param {any} record
 * @param {string} userId
 */
export function buildWatchEvent(record, userId) {
  if (record.annotation) throw new Error('An annotation is not a watch');
  if (!userId || record.status !== 'matched' || !Number.isSafeInteger(record.tmdbId) || record.tmdbId <= 0 ||
      !['movie', 'tv'].includes(record.mediaType)) throw new Error('A confirmed title is required');
  if (requiresEpisodeIdentity(record)) throw new Error('A streaming TV watch requires verified episode identity');
  const season = record.seasonNumber ?? null;
  const episode = record.episodeNumber ?? null;
  if ((season == null) !== (episode == null) || (season != null &&
      (record.mediaType !== 'tv' || !Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1))) {
    throw new Error('Incomplete episode identity');
  }
  const precision = record.date ? (record.datePrecision || 'day') : 'unknown';
  if (!['day', 'instant', 'unknown'].includes(precision) || (record.date && precision === 'unknown')) {
    throw new Error('Invalid date precision');
  }
  if (record.date) {
    const day = record.date.slice(0, 10);
    const parsed = new Date(day + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
      throw new Error('Invalid watch date');
    }
    if (precision === 'instant' && (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(record.date) || !Number.isFinite(Date.parse(record.date)))) {
      throw new Error('An instant requires a timezone');
    }
  }
  return {
    user_id: userId,
    source: record.source,
    source_account: record.account,
    source_key: importEventIdentity(record),
    tmdb_id: record.tmdbId,
    media_type: record.mediaType,
    season_number: season,
    episode_number: episode,
    watched_on: record.date?.slice(0, 10) ?? null,
    watched_at: precision === 'instant' ? record.date : null,
    date_precision: precision,
    external_ids: record.externalIds || {},
    source_rating: record.rating ?? null,
    source_review: record.note ?? null,
  };
}

/** Keep unselected and over-limit lists visible in the import results.
 * @param {{ lists: { id: string }[], selectedIds: string[], existingCount: number, premium?: boolean }} args
 */
export function planImportedLists({ lists, selectedIds, existingCount, premium = false }) {
  if (!Number.isSafeInteger(existingCount) || existingCount < 0) throw new Error('Invalid list count');
  let remaining = premium ? Infinity : Math.max(0, FREE_CUSTOM_LIST_CAP - existingCount);
  const selected = new Set(selectedIds);
  const seen = new Set();
  return lists.map(list => {
    let reason = null;
    if (seen.has(list.id)) reason = 'duplicate';
    else if (!selected.has(list.id)) reason = 'not_selected';
    else if (!remaining) reason = 'free_list_limit';
    else remaining--;
    seen.add(list.id);
    return { list, import: reason === null, reason };
  });
}

/** Stable across web/native. Raw file content stays on the device.
 * @param {any[]} entries
 * @param {string} source
 * @param {string} fileText
 */
export function identifyImportEntries(entries, source, fileText) {
  const fileDigest = bytesToHex(sha256(utf8ToBytes(fileText)));
  return entries.map((entry, recordIndex) => ({ ...entry, source, account: 'saved-export', fileDigest, recordIndex }));
}

/** Distinct records within one original file, or distinct provider watch IDs,
 * represent separate source watches. They must not become uncertain duplicates
 * merely because an earlier batch saved another watch of the same title.
 * Summaries and diary entries use different namespaces and still need review.
 */
function distinctSourceWatch(ownKey, knownKey) {
  try {
    const own = JSON.parse(ownKey);
    const known = JSON.parse(knownKey);
    if (!Array.isArray(own) || !Array.isArray(known) || own[0] !== known[0] || own[1] !== known[1]) return false;
    if (own[2] === 'file' && known[2] === 'file') {
      return own.length === 5 && known.length === 5 && /^[a-f0-9]{64}$/.test(own[3]) && own[3] === known[3] &&
        Number.isSafeInteger(known[4]) && known[4] >= 0 && own[4] !== known[4];
    }
    if (own.length !== 4 || known.length !== 4 || own[2] !== 'event' || known[2] !== 'event' || own[3] === known[3]) return false;
    if (own[0] === 'trakt') return /^[1-9]\d*$/.test(own[3]) && /^[1-9]\d*$/.test(known[3]);
    return own[0] === 'letterboxd' && String(own[3]).startsWith('diary:') && String(known[3]).startsWith('diary:');
  } catch { return false; }
}

/** Conservative review only. Never infer that two source records are one watch.
 * @param {any} entry
 * @param {any[]} knownEvents
 */
export function possibleWatchDuplicates(entry, knownEvents = []) {
  if (entry.status !== 'matched' || entry.destination || entry.annotation) return [];
  const ownKey = importEventIdentity(entry);
  if (knownEvents.some(event => event.source_key === ownKey)) return [];
  return knownEvents.filter(event => event.source_key !== ownKey && !distinctSourceWatch(ownKey, event.source_key) &&
    event.tmdb_id === entry.tmdbId && event.media_type === entry.mediaType &&
    (event.season_number ?? null) === (entry.seasonNumber ?? null) &&
    (event.episode_number ?? null) === (entry.episodeNumber ?? null) &&
    (!event.watched_on || !entry.date || event.watched_on === entry.date.slice(0, 10)));
}

/** The title summary cannot tell whether this individual watch was imported.
 * @param {any} entry
 */
export function alreadyImportedEvent(entry) {
  if (entry.status !== 'matched' || entry.destination) return false;
  const known = entry.annotation ? entry.knownAnnotations : entry.knownEvents;
  if (!known?.length) return false;
  const ownKey = importEventIdentity(entry);
  return known.some(event => event.source_key === ownKey);
}

/** @param {any} entry */
export function needsDuplicateReview(entry) {
  return entry.status === 'matched' && !!(entry.duplicateCandidates?.length || entry.pendingDuplicates?.length) && entry.duplicateDecision !== 'keep';
}

/** A Letterboxd watched summary is not evidence of another watch when a
 * diary entry for the confirmed film is selected. Recompute after match/skip
 * edits; do not merge records based on an unverified title string.
 * @param {any[]} entries
 * @returns {any[]}
 */
export function reviewPendingWatchSummaries(entries) {
  const diaries = new Map();
  for (const row of entries) {
    if (row.status !== 'matched' || row.source !== 'letterboxd' || !String(row.eventId || '').startsWith('diary:') || row.annotation || row.destination) continue;
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (!diaries.has(key)) diaries.set(key, []);
    diaries.get(key).push({ source_key: importEventIdentity(row), tmdb_id: row.tmdbId, media_type: row.mediaType });
  }
  return entries.map(row => ({ ...row, pendingDuplicates: row.status === 'matched' && row.source === 'letterboxd' &&
    String(row.eventId || '').startsWith('watched:') ? diaries.get(`${row.mediaType}:${row.tmdbId}`) || [] : [] }));
}

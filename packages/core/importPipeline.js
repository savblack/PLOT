/* The watch-history import, end to end, shared by both apps.
 *
 * The pure parts of this already lived in core (importParsing, importDedup,
 * importPlan — ~380 tested lines). The orchestration around them did not: web
 * and mobile each hand-wrote ~600 lines of resolve/read/build/write, and they
 * diverged on every step. Mobile ignored the release year when picking a TMDB
 * match, dropped ratings and reviews on the floor, and read the user's *whole*
 * history unscoped and unpaginated — so past PostgREST's row cap it silently
 * under-detected what was already there and the upsert overwrote existing
 * ratings and notes. That is the data loss importPlan.js was written to stop.
 *
 * The apps keep their own step machines (the user confirms a preview between
 * planning and writing), so this exports the four steps rather than one
 * run-it-all function. Network access is injected, so the whole sequence is
 * testable without TMDB or a database.
 */
import { writeImportedAnnotations } from './importAnnotations.js';
import { writeImportedList } from './importLists.js';
import { planHistoryImport } from './importPlan.js';
import { buildWatchEvent, possibleWatchDuplicates, needsDuplicateReview, requiresEpisodeIdentity, reviewPendingWatchSummaries } from './importEvents.js';
import { getConfig } from './config.js';
import { supabase } from './supabase.js';
import { genreIdsFromItem } from './media.js';
import { HISTORY_CONFLICT_TARGET } from './userMedia.js';
import { watchedAtFor } from './importParsing.js';
import { emit, HISTORY_CHANGED_EVENT } from './events.js';

/** TMDB searches run concurrently in batches, with a pause between them. */
const RESOLVE_BATCH = 4;
const RESOLVE_DELAY_MS = 250;
/** History rows are written in batches of this size. */
const WRITE_BATCH = 50;
/** PostgREST caps a response at 1000 rows (Supabase's db-max-rows). */
const READ_PAGE = 1000;
/**
 * Ids per `.in(...)` filter. This — not the paging below — is what actually
 * keeps each response under the cap: `history` is unique on
 * (user_id, tmdb_id, media_type), so 200 ids can return at most ~400 rows. The
 * paging loop is belt-and-braces for a future where that constraint relaxes
 * (it already did once, on `journal`, to allow rewatches).
 */
const ID_CHUNK = 200;

async function readSafely(query) {
  try { return await query; } catch (error) { return { data: null, error }; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const matchTitle = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

/** Only a unique title/type/year match can be accepted without review. */
export function pickTmdbMatch(entry, results = []) {
  const candidates = results.filter(r =>
    ['movie', 'tv'].includes(r.media_type) &&
    (!entry.hint || entry.hint === 'unknown' || r.media_type === entry.hint) &&
    matchTitle(r.title || r.name) === matchTitle(entry.title) &&
    (!entry.year || (r.release_date || r.first_air_date || '').slice(0, 4) === String(entry.year)));
  return candidates.length === 1 ? candidates[0] : null;
}

/** Choose only a candidate that came from the search response, or skip it.
 * @param {any} entry
 * @param {string} candidateKey Empty string leaves the entry unselected.
 */
export function chooseImportMatch(entry, candidateKey) {
  const match = entry.candidates?.find(r => `${r.media_type}:${r.id}` === candidateKey);
  if (!match) return { ...entry, status: 'unmatched', tmdbId: undefined, mediaType: undefined, tmdbTitle: undefined, posterPath: null };
  const chosen = { ...entry, status: 'matched', tmdbId: match.id, mediaType: match.media_type,
    tmdbTitle: match.title || match.name, posterPath: match.poster_path ?? null,
    genreIds: genreIdsFromItem(match), duplicateDecision: null };
  // A named episode resolved for one series must never carry its ordinal into
  // a different series when the user changes the title match.
  if (entry.episodeTitle && entry.episodeResolvedFor !== match.id) chosen.episodeNumber = undefined;
  if (getConfig().importEventsEnabled && requiresEpisodeIdentity(chosen)) return { ...chosen, status: 'unmatched', reason: 'episode_identity_required' };
  return { ...chosen, duplicateCandidates: entry.knownEvents ? possibleWatchDuplicates(chosen, entry.knownEvents) : [] };
}

/** Resolve a named episode after the user selects a verified catalogue candidate.
 * @param {any} entry
 * @param {string} candidateKey
 * @param {{ getSeason: (id: number, season: number) => Promise<any> }} deps
 */
export async function resolveImportMatch(entry, candidateKey, { getSeason }) {
  const chosen = chooseImportMatch(entry, candidateKey);
  if (!candidateKey || entry.source !== 'netflix' || !entry.episodeTitle
      || chosen.mediaType !== 'tv' || !Number.isSafeInteger(entry.seasonNumber) || entry.seasonNumber < 0) return chosen;
  try {
    const season = await getSeason(chosen.tmdbId, entry.seasonNumber);
    const episodes = (season?.episodes || []).filter(episode =>
      matchTitle(episode.name) === matchTitle(entry.episodeTitle)
      && Number.isSafeInteger(episode.episode_number) && episode.episode_number > 0);
    const resolved = { ...entry, reason: 'review', episodeNumber: undefined, episodeResolvedFor: undefined };
    if (episodes.length === 1) {
      resolved.episodeNumber = episodes[0].episode_number;
      resolved.episodeResolvedFor = chosen.tmdbId;
    }
    return chooseImportMatch(resolved, candidateKey);
  } catch {
    return { ...chosen, status: 'unmatched', episodeNumber: undefined, episodeResolvedFor: undefined, reason: 'search_failed' };
  }
}

function externalIdResults(response) {
  return [
    ...(response?.movie_results || []).map(result => ({ ...result, media_type: 'movie' })),
    ...(response?.tv_results || []).map(result => ({ ...result, media_type: 'tv' })),
  ];
}

/**
 * Resolve parsed entries to TMDB titles.
 * @param {any[]} entries
 * @param {{ search: (title: string) => Promise<any>, findByImdbId?: (id: string) => Promise<any>, findByTvdbId?: (id: number|string) => Promise<any>, findExternal?: (id: string) => Promise<any>, getSeason?: (id: number, season: number) => Promise<any>, onProgress?: (done: number, total: number) => void }} [deps]
 * @returns {Promise<any[]>} one result per entry, `status: 'matched' | 'unmatched'`
 */
export async function resolveImportEntries(entries, { search, findByImdbId, findByTvdbId, getSeason, findExternal, onProgress } = /** @type {any} */ ({})) {
  const resolved = [];
  const searches = new Map();

  for (const batch of chunk(entries, RESOLVE_BATCH)) {
    let requested = false;
    const settled = await Promise.all(batch.map(async (entry) => {
      try {
        if (entry.externalId && findExternal && !entry.externalIds?.imdb) {
          try {
            const match = pickTmdbMatch(entry, externalIdResults(await findExternal(entry.externalId)));
            if (match) return chooseImportMatch({ ...entry, candidates: [match], reason: 'external_id' }, `${match.media_type}:${match.id}`);
          } catch { /* Legacy title-level imports can fall back to title review. */ }
        }
        // TMDB supports TVDB find for television, not movie identities.
        // A TV Time movie with no IMDb ID must go through title review.
        const externalSource = entry.externalIds?.imdb ? 'imdb' : entry.externalIds?.tvdb && entry.hint !== 'movie' ? 'tvdb' : null;
        if (externalSource) {
          const lookup = externalSource === 'imdb' ? findByImdbId : findByTvdbId;
          if (!lookup) throw new Error('External identifier lookup is required');
          const externalId = entry.externalIds[externalSource];
          const externalKey = `${externalSource}:${externalId}`;
          if (!searches.has(externalKey)) { requested = true; searches.set(externalKey, lookup(externalId)); }
          const external = await searches.get(externalKey);
          if (!external) throw new Error('External identifier lookup failed');
          const candidates = [
            ...(external.movie_results || []).map(item => ({ ...item, media_type: 'movie' })),
            ...(external.tv_results || []).map(item => ({ ...item, media_type: 'tv' })),
          ].filter(item => Number.isSafeInteger(item.id) && item.id > 0);
          if (candidates.length) {
            const compatible = candidates.filter(item => !entry.hint || entry.hint === 'unknown' || item.media_type === entry.hint);
            return chooseImportMatch({ ...entry, candidates, reason: 'external_id' },
              compatible.length === 1 ? `${compatible[0].media_type}:${compatible[0].id}` : '');
          }
        }
        const key = matchTitle(entry.title);
        if (!searches.has(key)) { requested = true; searches.set(key, search(entry.title)); }
        const res = await searches.get(key);
        const candidates = (res?.results || []).filter(r => Number.isSafeInteger(r.id) && r.id > 0 && ['movie', 'tv'].includes(r.media_type));
        const match = entry.requiresWatchReview || (['tvtime', 'trakt'].includes(entry.source) && !entry.year) ? null : pickTmdbMatch(entry, candidates);
        if (entry.source === 'netflix' && entry.episodeTitle && match?.media_type === 'tv'
            && Number.isSafeInteger(entry.seasonNumber) && entry.seasonNumber >= 0 && getSeason) {
          const seasonKey = `season:${match.id}:${entry.seasonNumber}`;
          if (!searches.has(seasonKey)) { requested = true; searches.set(seasonKey, getSeason(match.id, entry.seasonNumber)); }
          return resolveImportMatch({ ...entry, candidates, reason: 'review' }, `tv:${match.id}`, {
            getSeason: () => searches.get(seasonKey),
          });
        }
        return chooseImportMatch({ ...entry, candidates, reason: candidates.length ? 'review' : 'not_found' },
          match ? `${match.media_type}:${match.id}` : '');
      } catch {
        return { ...entry, status: 'unmatched', candidates: [], reason: 'search_failed' };
      }
    }));

    resolved.push(...settled);
    onProgress?.(resolved.length, entries.length);
    if (resolved.length < entries.length) {
      if (requested) await sleep(RESOLVE_DELAY_MS);
      // Cached episode/title lookups consume no provider quota. Yield for UI
      // responsiveness without imposing a network delay per repeated record.
      else if (resolved.length % 1000 === 0) await sleep(0);
    }
  }

  return resolved;
}

/**
 * Read the history rows the user already holds for the given titles.
 *
 * Scoped to the ids this import resolved to, in chunks — not the user's whole
 * history, which grows without bound and truncates at the row cap. A truncated
 * read makes planHistoryImport think rows are new, and the upsert then
 * overwrites the rating and note already on them.
 *
 * @param {{ userId: string, tmdbIds?: number[] }} args
 * @returns {Promise<{ rows: any[], error: any }>} `error` non-null means the
 *   read was incomplete — callers must not plan against a partial list.
 */
export async function readExistingHistory({ userId, tmdbIds = [] }) {
  if (!userId || !tmdbIds.length) return { rows: [], error: null };

  const rows = [];
  for (const ids of chunk([...new Set(tmdbIds)], ID_CHUNK)) {
    let from = 0;
    for (;;) {
      const { data, error } = await readSafely(supabase
        .from('history')
        .select('tmdb_id, media_type')
        .eq('user_id', userId)
        .in('tmdb_id', ids)
        .range(from, from + READ_PAGE - 1));

      if (error) return { rows: [], error };
      rows.push(...(data || []));
      if (!data || data.length < READ_PAGE) break;
      from += READ_PAGE;
    }
  }
  return { rows, error: null };
}

/**
 * Build the history rows for the matched entries, paired with the index of the
 * result they came from so a preview can mark each one.
 * @param {{ userId: string, resolved?: any[] }} args
 * @returns {{ index: number, row: any }[]}
 */
export function buildImportRows({ userId, resolved = [] }) {
  return resolved.flatMap((r, index) => {
    if (r.status !== 'matched' || r.annotation) return [];

    const row = {
      user_id:     userId,
      tmdb_id:     r.tmdbId,
      media_type:  r.mediaType,
      title:       r.tmdbTitle,
      poster_path: r.posterPath ?? null,
      genre_ids:   r.genreIds ?? [],
      watched_at:  watchedAtFor(r),
    };

    // Letterboxd carries ratings and reviews; clamp to history's 1–10 scale.
    // Mobile used to drop both, so the same file lost them on one platform.
    if (r.rating != null) row.rating = Math.min(10, Math.max(1, Math.round(r.rating)));
    if (r.note) row.note = r.note;

    return [{ index, row }];
  });
}

/**
 * Write planned rows. Purely additive: planHistoryImport has already resolved
 * known collisions. Inserts ignore concurrent conflicts on the real constraint;
 * existing edits are never replaced and nothing is deleted. Failed batches are counted, not swallowed — an earlier
 * version discarded the error and reported the rows as imported anyway, which
 * is how a two-week outage went unnoticed.
 */
/**
 * @param {any[]} [rows]
 * @param {{ onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<{ inserted: number, failed: number, duplicates: number }>}
 */
export async function writeImportRows(rows = [], { onProgress } = {}) {
  let inserted = 0;
  let failed = 0;
  let done = 0;

  for (const batch of chunk(rows, WRITE_BATCH)) {
    try {
      const { data, error } = await supabase
        .from('history')
        .upsert(batch, { onConflict: HISTORY_CONFLICT_TARGET, ignoreDuplicates: true })
        .select('id');
      if (error) failed += batch.length;
      else inserted += data?.length ?? 0;
    } catch { failed += batch.length; }

    done += batch.length;
    onProgress?.(done, rows.length);
  }

  // Anything that writes history has to signal it, or a mounted useHistory
  // keeps serving the pre-import list.
  if (inserted) emit(HISTORY_CHANGED_EVENT);

  return { inserted, failed, duplicates: rows.length - inserted - failed };
}

/** Route confirmed annotations separately from watches and list membership.
 * Validate review decisions before either path can write. Results remain
 * explicit when one path fails, so retrying can use each store's source keys.
 * @param {{userId: string, resolved: any[], summaryRows: any[]}} input
 * @param {{onProgress?: (done: number, total: number) => void}} [options]
 */
export async function writeImportDocument({ userId, resolved, summaryRows }, { onProgress } = {}) {
  resolved = reviewPendingWatchSummaries(resolved);
  const annotations = resolved.filter(row => row.annotation);
  if (!annotations.length) return writeImportSelection({ userId, resolved, summaryRows }, { onProgress });
  if (!getConfig().importAnnotationsEnabled || !getConfig().importEventsEnabled) {
    return { inserted: 0, duplicates: 0, failed: resolved.filter(row => row.status === 'matched').length };
  }
  const watchesAndLists = resolved.filter(row => !row.annotation);
  if (watchesAndLists.some(needsDuplicateReview)) throw new Error('Duplicate review is required before import');
  const total = resolved.filter(row => row.status === 'matched').length;
  const firstCount = watchesAndLists.filter(row => row.status === 'matched').length;
  const outcome = watchesAndLists.length
    ? await writeImportSelection({ userId, resolved: watchesAndLists, summaryRows }, { onProgress: done => onProgress?.(done, total) })
    : { inserted: 0, duplicates: 0, failed: 0 };
  const saved = await writeImportedAnnotations({ userId, resolved: annotations, onProgress: done => onProgress?.(firstCount + done, total) });
  return { ...outcome, inserted: outcome.inserted + saved.inserted, duplicates: outcome.duplicates + saved.duplicates,
    failed: outcome.failed + saved.failed, annotations: saved };
}

/** Import confirmed events atomically with their title summaries, or use the
 * existing summary path while the additive schema is not deployed.
 * @param {{ userId: string, resolved: any[], summaryRows: any[] }} input
 * @param {{ onProgress?: (done: number, total: number) => void }} [opts]
 */
export async function writeImportSelection({ userId, resolved, summaryRows }, { onProgress } = {}) {
  resolved = reviewPendingWatchSummaries(resolved);
  // Annotation storage is a separate path. Fail closed even on legacy builds.
  if (resolved.some(row => row.annotation)) return { inserted: 0, failed: resolved.filter(row => row.status === 'matched').length, duplicates: 0 };
  // A preview can outlive a flag change. Never route event-only formats through
  // the legacy title-summary writer, which would discard episode identity.
  if (!getConfig().importEventsEnabled && resolved.some(row => ['trakt', 'imdb', 'tvtime'].includes(row.source))) {
    return { inserted: 0, failed: resolved.filter(row => row.status === 'matched').length, duplicates: 0 };
  }
  if (resolved.some(row => row.source === 'tvtime') && !getConfig().tvTimeImportEnabled) return { inserted: 0, failed: resolved.filter(row => row.status === 'matched').length, duplicates: 0 };
  const listRows = resolved.filter(row => row.destination);
  if (listRows.length) {
    // Keep membership and watches separate even when they share a title.
    // Archive callers receive per-list outcomes so allowance/selection skips
    // cannot disappear into the overall imported count.
    const watches = resolved.filter(row => !row.destination);
    const groups = new Map();
    for (const row of listRows) {
      const key = JSON.stringify([row.source, row.destination.kind, row.destination.key]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    if (!watches.length && groups.size === 1) return writeImportedList({ userId, resolved, onProgress });
    if (!getConfig().importEventsEnabled) return { inserted: 0, duplicates: 0, failed: resolved.filter(row => row.status === 'matched').length };
    // Validate every watch before making any membership writes.
    if (watches.some(needsDuplicateReview)) throw new Error('Duplicate review is required before import');
    const total = resolved.filter(row => row.status === 'matched').length;
    let done = 0;
    const result = { inserted: 0, duplicates: 0, failed: 0, lists: [] };
    const accumulate = outcome => {
      result.inserted += outcome.inserted;
      result.duplicates += outcome.duplicates;
      result.failed += outcome.failed;
    };
    if (watches.length) {
      accumulate(await writeImportSelection({ userId, resolved: watches, summaryRows: [] }, {
        onProgress: count => onProgress?.(done + count, total),
      }));
      done += watches.filter(row => row.status === 'matched').length;
    }
    for (const rows of groups.values()) {
      const outcome = await writeImportedList({ userId, resolved: rows, onProgress: count => onProgress?.(done + count, total) });
      accumulate(outcome);
      result.lists.push({ destination: rows[0].destination, ...outcome });
      done += rows.filter(row => row.status === 'matched').length;
      onProgress?.(done, total);
    }
    return result;
  }
  if (!getConfig().importEventsEnabled) return writeImportRows(summaryRows, { onProgress });
  if (resolved.some(needsDuplicateReview)) throw new Error('Duplicate review is required before import');
  const rows = buildImportRows({ userId, resolved });
  const summaries = new Map(planHistoryImport({ rows: rows.filter(({ index }) => resolved[index].episodeNumber == null).map(({ row }) => row) }).rows
    .map(row => [`${row.tmdb_id}:${row.media_type}`, row]));
  let records;
  try {
    records = rows.map(({ index, row }) => ({ event: buildWatchEvent(resolved[index], userId),
      // Episode metadata cannot supply a whole-series date, rating or review.
      summary: resolved[index].episodeNumber != null ? row : summaries.get(`${row.tmdb_id}:${row.media_type}`) }));
  } catch {
    return { inserted: 0, failed: rows.length, duplicates: 0 };
  }
  let inserted = 0;
  let failed = 0;
  let done = 0;
  let duplicates = 0;
  for (const batch of chunk(records, WRITE_BATCH)) {
    try {
      const { data, error } = await supabase.rpc('import_watch_events', { p_records: batch });
      if (error) failed += batch.length;
      else { inserted += data.inserted; duplicates += data.duplicates; }
    } catch { failed += batch.length; }
    done += batch.length;
    onProgress?.(done, records.length);
  }
  if (inserted) emit(HISTORY_CHANGED_EVENT);
  return { inserted, failed, duplicates };
}

/** Read potential collisions before confirmation, including every search candidate
 * so changing a match in the preview cannot bypass duplicate review.
 * @param {{ userId: string, resolved: any[] }} args
 */
export async function reviewImportDuplicates({ userId, resolved }) {
  if (!getConfig().importEventsEnabled || resolved.every(row => row.destination)) return { resolved, error: null };
  const annotations = resolved.filter(entry => entry.annotation);
  if (annotations.length && !getConfig().importAnnotationsEnabled) return { resolved: [], error: new Error('Annotation imports are unavailable') };
  const annotationRows = [];
  const annotationIds = [...new Set(annotations.flatMap(entry => (entry.candidates || []).map(candidate => candidate.id)))];
  for (const part of chunk(annotationIds, ID_CHUNK)) {
    for (let from = 0; ; from += READ_PAGE) {
      const { data, error } = await readSafely(supabase.from('imported_annotations')
        .select('source_key,tmdb_id,media_type').eq('user_id', userId)
        .in('tmdb_id', part).order('id').range(from, from + READ_PAGE - 1));
      if (error) return { resolved: [], error };
      for (const row of data || []) annotationRows.push(row);
      if (!data || data.length < READ_PAGE) break;
    }
  }
  const ids = [...new Set(resolved.filter(entry => !entry.annotation && !entry.destination).flatMap(entry => (entry.candidates || []).map(candidate => candidate.id)))];
  const events = [];
  for (const part of chunk(ids, ID_CHUNK)) {
    for (let from = 0; ; from += READ_PAGE) {
      const { data, error } = await readSafely(supabase.from('watch_events')
        .select('source_key,source,tmdb_id,media_type,season_number,episode_number,watched_on')
        .eq('user_id', userId).in('tmdb_id', part).order('id').range(from, from + READ_PAGE - 1));
      if (error) return { resolved: [], error };
      events.push(...(data || []));
      if (!data || data.length < READ_PAGE) break;
    }
  }
  const annotationsByTitle = new Map();
  for (const row of annotationRows) {
    const key = `${row.media_type}:${row.tmdb_id}`;
    if (!annotationsByTitle.has(key)) annotationsByTitle.set(key, []);
    annotationsByTitle.get(key).push(row);
  }
  const byTitle = new Map();
  for (const event of events) {
    const key = `${event.media_type}:${event.tmdb_id}`;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(event);
  }
  return { error: null, resolved: resolved.map(entry => {
    const knownEvents = (entry.candidates || []).flatMap(candidate => byTitle.get(`${candidate.media_type}:${candidate.id}`) || []);
    const knownAnnotations = entry.annotation ? (entry.candidates || []).flatMap(candidate =>
      annotationsByTitle.get(`${candidate.media_type}:${candidate.id}`) || []) : [];
    return chooseImportMatch({ ...entry, knownEvents, knownAnnotations }, entry.status === 'matched' ? `${entry.mediaType}:${entry.tmdbId}` : '');
  }) };
}

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Pick the best TMDB match for one parsed entry.
 *
 * Ranking, in order: narrow to the hinted media type when that leaves anything,
 * then prefer an exact release-year match when the file gave us a year
 * (Letterboxd does). Without the year step, remakes and same-titled films
 * resolve to whichever is more popular — which is how the same file imported
 * different titles on each platform.
 */
export function pickTmdbMatch(entry, results = []) {
  let candidates = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');

  if (entry.hint && entry.hint !== 'unknown') {
    const typed = candidates.filter(r => r.media_type === entry.hint);
    if (typed.length) candidates = typed;
  }

  let preferred = candidates[0];
  if (entry.year) {
    const yearMatch = candidates.find(r => {
      const d = r.release_date || r.first_air_date || '';
      return d.slice(0, 4) === String(entry.year);
    });
    if (yearMatch) preferred = yearMatch;
  }
  return preferred ?? null;
}

/**
 * Resolve parsed entries to TMDB titles.
 * @param {any[]} entries
 * @param {{ search: (title: string) => Promise<any>, onProgress?: (done: number, total: number) => void }} [deps]
 * @returns {Promise<any[]>} one result per entry, `status: 'matched' | 'unmatched'`
 */
export async function resolveImportEntries(entries, { search, onProgress } = /** @type {any} */ ({})) {
  const resolved = [];

  for (const batch of chunk(entries, RESOLVE_BATCH)) {
    const settled = await Promise.all(batch.map(async (entry) => {
      try {
        const res = await search(entry.title);
        const match = pickTmdbMatch(entry, res?.results || []);
        if (!match) return { ...entry, status: 'unmatched' };
        return {
          ...entry,
          status:     'matched',
          tmdbId:     match.id,
          mediaType:  match.media_type,
          tmdbTitle:  match.title || match.name,
          posterPath: match.poster_path ?? null,
          // Kept so the written row can carry genre_ids. Without it every
          // imported title contributes zero genre signal to user_title_signals,
          // the view behind get_for_you — see userMedia.logWatchedItem.
          genreIds:   genreIdsFromItem(match),
        };
      } catch {
        return { ...entry, status: 'unmatched' };
      }
    }));

    resolved.push(...settled);
    onProgress?.(resolved.length, entries.length);
    if (resolved.length < entries.length) await sleep(RESOLVE_DELAY_MS);
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
      const { data, error } = await supabase
        .from('history')
        .select('tmdb_id, media_type')
        .eq('user_id', userId)
        .in('tmdb_id', ids)
        .range(from, from + READ_PAGE - 1);

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
    if (r.status !== 'matched') return [];

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
 * every collision, so each batch is a plain upsert on the real constraint and
 * nothing is deleted. Failed batches are counted, not swallowed — an earlier
 * version discarded the error and reported the rows as imported anyway, which
 * is how a two-week outage went unnoticed.
 */
/**
 * @param {any[]} [rows]
 * @param {{ onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<{ inserted: number, failed: number }>}
 */
export async function writeImportRows(rows = [], { onProgress } = {}) {
  let inserted = 0;
  let failed = 0;
  let done = 0;

  for (const batch of chunk(rows, WRITE_BATCH)) {
    const { error } = await supabase
      .from('history')
      .upsert(batch, { onConflict: HISTORY_CONFLICT_TARGET });

    if (error) failed += batch.length;
    else inserted += batch.length;

    done += batch.length;
    onProgress?.(done, rows.length);
  }

  // Anything that writes history has to signal it, or a mounted useHistory
  // keeps serving the pre-import list.
  if (inserted) emit(HISTORY_CHANGED_EVENT);

  return { inserted, failed };
}

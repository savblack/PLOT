import { supabase } from './supabase.js';
import { baseMediaRow, genreIdsFromItem } from './media.js';
import { localDateStr } from './date.js';
import { normalizeRating } from './ratings.js';

export async function saveListItem({ listId, userId, item, providerIds = [], streamingDate = null }) {
  const mediaRow = baseMediaRow(item);
  if (!listId || !userId || !mediaRow) return { data: null, error: null, row: null };

  const row = {
    list_id: listId,
    user_id: userId,
    ...mediaRow,
    genre_ids: genreIdsFromItem(item),
    provider_ids: providerIds,
    streaming_date: streamingDate,
  };

  const { data, error } = await supabase
    .from('list_items')
    .insert(row)
    .select()
    .single();

  return { data, error, row };
}

export async function deleteListItem({ listId, tmdbId, userId }) {
  if (!listId || !tmdbId) return { error: null };

  const query = supabase
    .from('list_items')
    .delete()
    .eq('list_id', listId)
    .eq('tmdb_id', Number(tmdbId));

  // Defence-in-depth: also filter by user_id when provided (RLS should enforce this too)
  return userId ? query.eq('user_id', userId) : query;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* The unique constraint every history upsert targets. Named once so the app
   cannot drift from the database: it must stay in step with
   history_user_id_tmdb_id_media_type_watched_at_key (migration 20260727010000).
   Naming a constraint that no longer exists does not fail loudly — PostgREST
   returns 42P10 and the write simply never happens, which is how the import
   spent two weeks silently writing nothing. media_type is part of the key
   because TMDB numbers movies and TV separately: movie 262 and tv 262 are
   unrelated titles. */
export const HISTORY_CONFLICT_TARGET = 'user_id,tmdb_id,media_type,watched_at';

export async function logWatchedItem({ userId, item, rating, note, dnf, watchedAt = localDateStr() }) {
  const mediaRow = baseMediaRow(item);
  if (!userId || !mediaRow) return { data: null, error: null, row: null };

  // Validate watchedAt format to prevent bad date strings reaching the DB
  const safeWatchedAt = DATE_RE.test(watchedAt) ? watchedAt : localDateStr();

  const normalizedRating = normalizeRating(rating);

  const row = {
    user_id: userId,
    ...mediaRow,
    // Mirrors saveListItem. user_title_signals (the materialized view behind
    // get_for_you's content-similarity tier) unions list_items and history and
    // reads genre_ids from both — so leaving this off made every watched title
    // contribute zero genre signal. Column is nullable here, unlike
    // list_items', so default to [] rather than null to match that view's
    // coalesce and keep the two arms shaped the same.
    genre_ids: genreIdsFromItem(item),
    watched_at: safeWatchedAt,
    rating: normalizedRating || null,
    note: note ?? null,
    dnf: dnf ?? false,
  };

  // A rewatch on a new date becomes its own history row; the same date
  // overwrites in place, so duplicate taps and re-imports don't pile up.
  const { data, error } = await supabase
    .from('history')
    .upsert(row, { onConflict: HISTORY_CONFLICT_TARGET })
    .select()
    .single();

  return { data, error, row };
}

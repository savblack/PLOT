import { supabase } from './supabase.js';
import { baseMediaRow } from './media.js';
import { localDateStr } from './date.js';
import { normalizeRating } from './ratings.js';

export async function saveListItem({ listId, userId, item, providerIds = [], streamingDate = null }) {
  const mediaRow = baseMediaRow(item);
  if (!listId || !userId || !mediaRow) return { data: null, error: null, row: null };

  const row = {
    list_id: listId,
    user_id: userId,
    ...mediaRow,
    genre_ids: Array.isArray(item?.genre_ids) ? item.genre_ids : [],
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

export async function logWatchedItem({ userId, item, rating, note, dnf, watchedAt = localDateStr(), logRewatches = true }) {
  const mediaRow = baseMediaRow(item);
  if (!userId || !mediaRow) return { data: null, error: null, row: null };

  // Validate watchedAt format to prevent bad date strings reaching the DB
  const safeWatchedAt = DATE_RE.test(watchedAt) ? watchedAt : localDateStr();

  const normalizedRating = normalizeRating(rating);

  const row = {
    user_id: userId,
    ...mediaRow,
    watched_at: safeWatchedAt,
    rating: normalizedRating || null,
    note: note ?? null,
    dnf: dnf ?? false,
  };

  // logRewatches: a rewatch on a new date becomes its own history row
  // (upsert on user_id,tmdb_id,watched_at — the same date still overwrites,
  // so duplicate taps/re-imports don't create duplicate rows). With the
  // preference off, collapse back to the old single-row-per-title behavior —
  // there's no more DB-level unique(user_id,tmdb_id) to upsert against (it
  // was relaxed so rewatches can coexist), so do it explicitly: clear any
  // existing rows for this title first, then insert the one true row.
  if (!logRewatches) {
    await supabase.from('journal').delete().eq('user_id', userId).eq('tmdb_id', row.tmdb_id);
    const { data, error } = await supabase.from('journal').insert(row).select().single();
    return { data, error, row };
  }

  const { data, error } = await supabase
    .from('journal')
    .upsert(row, { onConflict: 'user_id,tmdb_id,watched_at' })
    .select()
    .single();

  return { data, error, row };
}

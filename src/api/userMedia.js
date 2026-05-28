import { supabase } from './supabase.js';
import { baseMediaRow } from '../domain/media.js';
import { localDateStr } from '../utils/date.js';
import { normalizeRating } from '../utils/ratings.js';

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

export async function deleteListItem({ listId, tmdbId }) {
  if (!listId || !tmdbId) return { error: null };

  return supabase
    .from('list_items')
    .delete()
    .eq('list_id', listId)
    .eq('tmdb_id', Number(tmdbId));
}

export async function logWatchedItem({ userId, item, rating, note, dnf, watchedAt = localDateStr() }) {
  const mediaRow = baseMediaRow(item);
  if (!userId || !mediaRow) return { data: null, error: null, row: null };
  const normalizedRating = normalizeRating(rating);

  const row = {
    user_id: userId,
    ...mediaRow,
    watched_at: watchedAt,
    rating: normalizedRating || null,
    note: note ?? null,
    dnf: dnf ?? false,
  };

  const { data, error } = await supabase
    .from('journal')
    .upsert(row, { onConflict: 'user_id,tmdb_id' })
    .select()
    .single();

  return { data, error, row };
}

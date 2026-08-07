import { supabase } from './supabase.js';
import { baseMediaRow, mediaIdentityRow, genreIdsFromItem } from './media.js';
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

// Shared by useFavorites' toggleFavorite (the "add" branch) and onboarding's
// bulk favourite-save, so both paths write the identical row shape.
export async function saveFavorite({ userId, item }) {
  const row = mediaIdentityRow(item);
  if (!userId || !row) return { data: null, error: null, row: null };

  const { data, error } = await supabase
    .from('user_favourites')
    .upsert({ user_id: userId, ...row }, { onConflict: 'user_id,tmdb_id' })
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

/* The default watchlist every account gets. useWatchlist's bootstrap resolves
   it as part of loading items; this is the standalone path for callers that
   need the id without the hook — currently the home screen's lazy create, for
   accounts onboarded before My List was guaranteed at signup.

   Reads before inserting rather than upserting: an upsert has to supply
   is_public, so losing the race would quietly reset a list the user had made
   public. lists carries a unique (user_id, name), so a genuine race surfaces
   as 23505 and is recovered by re-reading the winner. */
const DEFAULT_LIST_NAME = 'My List';

export async function getOrCreateMyListId({ userId, logger = console }) {
  if (!userId) return null;

  const readList = async () => {
    const { data, error } = await supabase
      .from('lists')
      .select('id')
      .eq('user_id', userId)
      .eq('name', DEFAULT_LIST_NAME)
      .maybeSingle();
    return { listId: data?.id ?? null, error };
  };

  const existing = await readList();
  if (existing.error) {
    logger.warn('[userMedia] read My List failed:', existing.error);
    return null;
  }
  if (existing.listId) return existing.listId;

  const { data, error } = await supabase
    .from('lists')
    .insert({ user_id: userId, name: DEFAULT_LIST_NAME, is_public: false })
    .select('id')
    .single();

  if (!error && data?.id) return data.id;

  if (error?.code === '23505') {
    const retry = await readList();
    if (retry.error) {
      logger.warn('[userMedia] retry read My List failed:', retry.error);
      return null;
    }
    return retry.listId;
  }

  logger.warn('[userMedia] create My List failed:', error);
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* The unique constraint every history upsert targets. Named once so the app
   cannot drift from the database: it must stay in step with
   history_user_id_tmdb_id_media_type_key (migration 20260806000001).
   Naming a constraint that no longer exists does not fail loudly — PostgREST
   returns 42P10 and the write simply never happens, which is how the import
   spent two weeks silently writing nothing. media_type is part of the key
   because TMDB numbers movies and TV separately: movie 262 and tv 262 are
   unrelated titles. watched_at is not: history holds one row per title, so a
   second watch updates that row rather than adding another. */
export const HISTORY_CONFLICT_TARGET = 'user_id,tmdb_id,media_type';

/** Targeted existence check — does NOT load the full history list. */
export async function findHistoryEntry({ userId, tmdbId, mediaType }) {
  if (!userId || !tmdbId) return null;
  const { data } = await supabase
    .from('history')
    .select('id')
    .eq('user_id', userId)
    .eq('tmdb_id', Number(tmdbId))
    .eq('media_type', mediaType)
    .limit(1)
    .maybeSingle();
  return data || null;
}

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

  // One row per title: watching something again updates the row already there,
  // moving its date, so duplicate taps and re-imports don't pile up either.
  const { data, error } = await supabase
    .from('history')
    .upsert(row, { onConflict: HISTORY_CONFLICT_TARGET })
    .select()
    .single();

  return { data, error, row };
}

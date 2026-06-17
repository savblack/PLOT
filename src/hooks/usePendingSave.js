import { useEffect, useRef } from 'react';
import { usePostHog } from '@posthog/react';
import { tmdb } from '../api/tmdb.js';
import { readPendingSave, clearPendingSave } from '../utils/pendingSave.js';

/**
 * Drains a pending "save to watchlist" intent left by the /save deep link.
 *
 * Runs inside the authenticated app shell so it can reuse the exact watchlist
 * add path the app uses everywhere else (watchlist.addToList → saveListItem).
 * Looks up the full TMDB record at runtime (never hardcoded ids), adds it,
 * fires a PostHog event, then opens the title so the user lands on it.
 *
 * Idempotent: saving an already-saved title is a no-op confirmation, not an error.
 *
 * @param {object}   args
 * @param {object}   args.user        Supabase auth user (or null)
 * @param {object}   args.watchlist   useWatchlist() return value
 * @param {function} args.openPanel   (id, mediaType) => void
 * @param {function} [args.onResult]  ({ status, message, title }) => void  (toast)
 */
export function usePendingSave({ user, watchlist, openPanel, onResult }) {
  const posthog = usePostHog();
  const processing = useRef(false);

  const { loading, addToList, isInList } = watchlist;

  useEffect(() => {
    // Wait until auth + the watchlist (its "My List") have finished bootstrapping,
    // otherwise addToList has no list to write to.
    if (!user?.id || loading || processing.current) return;

    const intent = readPendingSave();
    if (!intent) return;

    processing.current = true;
    // Clear up front so a transient failure or re-render can't double-apply it.
    clearPendingSave();

    (async () => {
      const { tmdb_id, media_type, source } = intent;
      try {
        const alreadySaved = isInList(tmdb_id);

        // Resolve the full TMDB record at runtime (id came from the link, never guessed).
        const details = alreadySaved
          ? null
          : media_type === 'tv'
            ? await tmdb.getTVDetails(tmdb_id)
            : await tmdb.getMovieDetails(tmdb_id);

        let added = false;
        if (!alreadySaved && details?.id) {
          const item = {
            ...details,
            media_type,
            // Detail responses carry `genres` objects; the add path wants `genre_ids`.
            genre_ids: Array.isArray(details.genres) ? details.genres.map(g => g.id) : [],
          };
          added = !!(await addToList(item));
        }

        const title = details?.title || details?.name || '';
        const ok = alreadySaved || added || isInList(tmdb_id);

        if (ok) {
          posthog?.capture('watchlist_saved', {
            tmdb_id,
            media_type,
            source: source || 'deep_link',
            already_saved: alreadySaved,
          });
          openPanel(tmdb_id, media_type);
          onResult?.({
            status: 'success',
            title,
            message: alreadySaved
              ? `${title || 'This title'} is already on your watchlist`
              : `Saved${title ? ` ${title}` : ''} to your watchlist`,
          });
        } else {
          onResult?.({ status: 'error', message: "Couldn't save that title. Please try again." });
        }
      } catch (e) {
        console.error('[usePendingSave] failed to complete pending save:', e);
        onResult?.({ status: 'error', message: "Couldn't save that title. Please try again." });
      } finally {
        processing.current = false;
      }
    })();
  }, [user?.id, loading, addToList, isInList, openPanel, onResult, posthog]);
}

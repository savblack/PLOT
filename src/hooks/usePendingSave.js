import { useEffect, useRef } from 'react';
import { tmdb } from '../api/tmdb.js';
import { readPendingSave, clearPendingSave } from '../utils/pendingSave.js';
import { drainPendingSave } from '../utils/drainPendingSave.js';
import { track, markActivated, EVENTS } from '../lib/analytics.js';

// Give the watchlist + the first Discover load a beat to settle so the
// deep-link's single detail fetch isn't competing inside the initial
// proxy-request burst (which is what triggers the per-IP 429s).
const PROCESS_DELAY_MS = 600;

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
 * Resilient to the tmdb-proxy's per-IP rate limit. The decision tree lives in
 * drainPendingSave(); this hook only owns timing + the re-entrancy guard. The
 * intent is cleared ONLY on a terminal outcome (success / already-saved /
 * non-retryable error) — a transient 429 leaves it in place for the next load.
 *
 * @param {object}   args
 * @param {object}   args.user        Supabase auth user (or null)
 * @param {object}   args.watchlist   useWatchlist() return value
 * @param {function} args.openPanel   (id, mediaType) => void
 * @param {function} [args.onResult]  ({ status, message, title }) => void  (toast)
 */
export function usePendingSave({ user, watchlist, openPanel, onResult }) {
  const processing = useRef(false);

  const { loading, addToList, isInList } = watchlist;

  useEffect(() => {
    // Wait until auth + the watchlist (its "My List") have finished bootstrapping,
    // otherwise addToList has no list to write to.
    if (!user?.id || loading || processing.current) return;

    const intent = readPendingSave();
    if (!intent) return;

    processing.current = true;

    // Defer slightly so the deep-link detail fetch doesn't race the initial
    // Discover burst.
    let cancelled = false;
    let started = false;
    const timer = setTimeout(() => {
      started = true;
      (async () => {
        try {
          const { terminal } = await drainPendingSave(
            { intent },
            {
              getDetails: tmdb.getDetails,
              isInList,
              addToList,
              // Side-effects are no-ops once the effect has torn down.
              openPanel: (...a) => { if (!cancelled) openPanel(...a); },
              track,
              markActivated,
              EVENTS,
              onResult: (...a) => { if (!cancelled) onResult?.(...a); },
            },
          );
          // Only drop the intent on a terminal outcome; a transient failure is
          // preserved for the next load to retry.
          if (terminal) clearPendingSave();
        } catch (e) {
          // Unexpected throw — keep the intent so a reload can retry.
          console.error('[usePendingSave] failed to complete pending save:', e);
        } finally {
          processing.current = false;
        }
      })();
    }, PROCESS_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // If we tore down before the deferred run even started, release the guard
      // so a later mount can pick the (still-stored) intent back up. If the run
      // already started, leave the guard alone — its own finally{} clears it,
      // preserving the "can't double-apply" invariant.
      if (!started) processing.current = false;
    };
  }, [user?.id, loading, addToList, isInList, openPanel, onResult]);
}

/**
 * Pure, framework-free core of the /save deep-link processor.
 *
 * The React hook (src/hooks/usePendingSave.js) handles timing, the re-entrancy
 * guard, and effect teardown; the actual "resolve the title, add it, decide
 * whether the intent is done" decision tree lives here so it can be unit-tested
 * without a DOM. All side-effecting collaborators are injected.
 *
 * Rate-limit resilience: the title detail fetch goes through `getDetails`, which
 * reports transient (429 / network) vs. terminal (404 / bad id) failure. We only
 * treat the intent as TERMINAL — and therefore clearable — on success,
 * already-saved, or a non-retryable error. A transient failure returns
 * `{ terminal: false }` so the caller leaves the intent in place for the next
 * load to retry.
 *
 * @param {object} args
 * @param {{ tmdb_id: number, media_type: 'movie'|'tv', source?: string }} args.intent
 * @param {object}   deps
 * @param {(mediaType: string, id: number) => Promise<{ ok: boolean, data: any, retryable: boolean }>} deps.getDetails
 * @param {(id: number) => boolean}            deps.isInList
 * @param {(item: object, opts?: { source?: string }) => Promise<any>} deps.addToList
 * @param {(id: number, mediaType: string) => void} deps.openPanel
 * @param {(event: string, props?: object) => void} deps.track
 * @param {object}   deps.EVENTS
 * @param {(result: { status: string, message: string, title?: string }) => void} [deps.onResult]
 * @returns {Promise<{ terminal: boolean, status: 'success'|'already_saved'|'error'|'retry' }>}
 *
 * Analytics note: a genuinely NEW save is emitted by watchlist.addToList via the
 * core `onWatchlistSave` seam (with source 'deep_link'), so we don't fire
 * watchlist_saved for it here — that would double-count. We DO emit it for the
 * already-saved branch below, where addToList is never called.
 */
export async function drainPendingSave({ intent }, deps) {
  const { getDetails, isInList, addToList, openPanel, track, EVENTS, onResult } = deps;
  const { tmdb_id, media_type, source } = intent;
  const src = source || 'deep_link';

  const confirm = ({ title, message }) => {
    openPanel(tmdb_id, media_type);
    onResult?.({ status: 'success', title, message });
  };

  // Already on the list — pure confirmation, nothing to fetch or add. Idempotent.
  // No add happens here, so this is where the (already_saved) signal is emitted.
  if (isInList(tmdb_id)) {
    track(EVENTS.WATCHLIST_SAVED, { tmdb_id, media_type, source: src, already_saved: true });
    confirm({ title: '', message: 'This title is already on your watchlist' });
    return { terminal: true, status: 'already_saved' };
  }

  // Resolve the full TMDB record at runtime (id came from the link, never guessed).
  const { ok, data: details, retryable } = await getDetails(media_type, tmdb_id);

  if (!ok) {
    if (retryable) {
      // Transient (rate-limited / network) — leave the intent for the next load.
      // No toast: a silent retry-later beats a scary "couldn't save" on a 429.
      return { terminal: false, status: 'retry' };
    }
    // Terminal failure (e.g. unknown id) — don't loop on it forever.
    onResult?.({ status: 'error', message: "Couldn't save that title. Please try again." });
    return { terminal: true, status: 'error' };
  }

  let added = false;
  if (details?.id) {
    const item = {
      ...details,
      media_type,
      // Detail responses carry `genres` objects; the add path wants `genre_ids`.
      genre_ids: Array.isArray(details.genres) ? details.genres.map(g => g.id) : [],
    };
    // Pass the source so core's onWatchlistSave seam tags the watchlist_saved
    // event 'deep_link' (rather than the default 'in_app').
    added = !!(await addToList(item, { source: src }));
  }

  const title = details?.title || details?.name || '';
  // Idempotent: a concurrent add (or a slow isInList) still counts as saved.
  if (added || isInList(tmdb_id)) {
    confirm({ title, message: `Saved${title ? ` ${title}` : ''} to your watchlist` });
    return { terminal: true, status: 'success' };
  }

  // addToList failed without a transient signal — terminal so we don't loop,
  // but surface a retry-able toast.
  onResult?.({ status: 'error', message: "Couldn't save that title. Please try again." });
  return { terminal: true, status: 'error' };
}

export async function moveSavedShowToWatching({
  startWatching,
  removeFromSaved,
  rollbackWatching,
}) {
  const started = await startWatching();
  if (!started) {
    return { ok: false, error: 'Could not start watching. Please try again.' };
  }

  const removed = await removeFromSaved();
  if (!removed) {
    await rollbackWatching?.();
    return { ok: false, error: 'Could not move this show out of Saved. Please try again.' };
  }

  return { ok: true };
}

/* The transition a title makes when it becomes "watched".
 *
 * Callers pass the title's current state, not the decisions taken from it.
 * They used to pass the decisions, and every caller re-derived the same
 * predicates from the same three facts — so they drifted: useFavorites
 * omitted the media-type guard web applies, and mobile's search row skipped
 * this module entirely and cleared nothing at all.
 *
 * The rule: finishing something takes it off every other list. Watching state
 * clears (TV only — movie and TV tmdb ids can collide, so "currently
 * watching" is only meaningful for TV), and the watchlist entry goes.
 */
export function resolveWatchedTransition({ mediaType, isWatching, inList }) {
  return {
    shouldClearWatching:   mediaType === 'tv' && !!isWatching,
    shouldRemoveFromSaved: !!inList,
  };
}

export async function markMediaAsWatched({
  logWatched,
  clearWatching,
  removeFromSaved,
  rollbackHistory,
  mediaType,
  isWatching,
  inList,
}) {
  const { shouldClearWatching, shouldRemoveFromSaved } =
    resolveWatchedTransition({ mediaType, isWatching, inList });

  const logged = await logWatched();
  if (!logged) {
    return { ok: false, error: 'Could not update watch status. Please try again.' };
  }

  if (shouldClearWatching) {
    const cleared = await clearWatching();
    if (!cleared) {
      await rollbackHistory?.();
      return { ok: false, error: 'Could not clear the active watching state. Please try again.' };
    }
  }

  if (shouldRemoveFromSaved) {
    const removed = await removeFromSaved();
    if (!removed) {
      await rollbackHistory?.();
      return { ok: false, error: 'Could not remove this show from Saved. Please try again.' };
    }
  }

  return { ok: true };
}

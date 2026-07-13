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

export async function markMediaAsWatched({
  logWatched,
  clearWatching,
  removeFromSaved,
  rollbackHistory,
  shouldClearWatching,
  shouldRemoveFromSaved,
}) {
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

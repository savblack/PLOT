// Shared helpers for detecting stale-chunk load failures (common after a deploy
// invalidates the previously-loaded JS) and guarding the one-time auto-reload.
// Lives outside the boundary components so both the class ErrorBoundary and the
// router-level RouteErrorBoundary can reuse it without tripping react-refresh.

export const RELOAD_KEY = 'plot_chunk_reload';

// If a chunk STILL fails right after we reloaded, the reload didn't help (a
// genuinely broken deploy) — give up so we don't loop. Outside this window a
// fresh stale-chunk error is treated as new: a long-lived tab that survives
// several deploys (e.g. one left open for days, then a rarely-loaded route like
// /logout is finally opened) gets its own recovery reload instead of crashing
// because an earlier, unrelated chunk error already spent a one-shot flag.
const RELOAD_WINDOW_MS = 10_000;

// True when we reloaded to recover from a chunk error too recently to try again.
export function recentlyReloaded() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  return last > 0 && Date.now() - last < RELOAD_WINDOW_MS;
}

// Record that we're about to reload to recover from a stale chunk.
export function markChunkReload() {
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
}

export function isChunkError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    error?.name === 'ChunkLoadError'
  );
}

// Shared helpers for detecting stale-chunk load failures (common after a deploy
// invalidates the previously-loaded JS) and guarding the auto-reload budget.
// Lives outside the boundary components so the class ErrorBoundary, the
// router-level RouteErrorBoundary, AND the inline pre-React listener in
// index.html (which catches a failed entry/vendor script — something no React
// boundary ever sees, since it happens before React mounts) all share one
// budget in sessionStorage instead of racing each other's reloads.

export const RELOAD_KEY = 'plot_chunk_reload';

// Deploys land every few minutes here (dependabot + the self-fixing loops), so
// a single reload can still land mid-deploy and hit another stale chunk right
// away — allow a couple of attempts before giving up. Past that budget, it's
// treated as a genuinely broken deploy rather than a race, so we stop looping
// and show the crash screen. Outside the window, a fresh stale-chunk error
// (e.g. a long-lived tab, or a rarely-loaded route like /logout opened days
// later) gets its own budget instead of inheriting an unrelated older count.
const RELOAD_WINDOW_MS = 20_000;
const MAX_RELOADS = 2;

function readReloadState() {
  const [count, ts] = (sessionStorage.getItem(RELOAD_KEY) || '').split(',');
  return { count: Number(count) || 0, ts: Number(ts) || 0 };
}

// True when we've already spent this window's reload budget too recently to
// try again.
export function recentlyReloaded() {
  const { count, ts } = readReloadState();
  return count >= MAX_RELOADS && Date.now() - ts < RELOAD_WINDOW_MS;
}

// Record that we're about to reload to recover from a stale chunk.
export function markChunkReload() {
  const { count, ts } = readReloadState();
  const next = Date.now() - ts < RELOAD_WINDOW_MS ? count + 1 : 1;
  sessionStorage.setItem(RELOAD_KEY, `${next},${Date.now()}`);
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

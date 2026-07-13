// Shared helpers for detecting stale-chunk load failures (common after a deploy
// invalidates the previously-loaded JS) and guarding the one-time auto-reload.
// Lives outside the boundary components so both the class ErrorBoundary and the
// router-level RouteErrorBoundary can reuse it without tripping react-refresh.

export const RELOAD_KEY = 'plot_chunk_reload';

export function isChunkError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    error?.name === 'ChunkLoadError'
  );
}

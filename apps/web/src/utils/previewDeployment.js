/**
 * Returns whether the current app host is a non-production deployment.
 * `preview.theplot.tv` is PLOT's stable staging host; Cloudflare also creates
 * temporary `*.plot-5wr.pages.dev` hosts for feature branches; `localhost` /
 * `127.0.0.1` cover local dev.
 */
export function isPreviewDeployment() {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === 'preview.theplot.tv' ||
    hostname.endsWith('.plot-5wr.pages.dev')
  );
}

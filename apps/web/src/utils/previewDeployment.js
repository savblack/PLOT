/**
 * Returns whether the current app host is a non-production preview deployment.
 * `preview.theplot.tv` is PLOT's stable staging host; Cloudflare also creates
 * temporary `*.plot-5wr.pages.dev` hosts for feature branches.
 */
export function isPreviewDeployment() {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'preview.theplot.tv' || hostname.endsWith('.plot-5wr.pages.dev');
}

import { isPreviewHostname } from '@plot/core/captchaGate.js';

/**
 * Returns whether the current app host is a non-production deployment.
 * Cloudflare creates a `*.plot-5wr.pages.dev` host per feature branch;
 * `localhost` / `127.0.0.1` cover local dev. The stable `preview.theplot.tv`
 * staging host was retired on 2026-09-06 — per-branch previews replaced it.
 * The host list lives in core (isPreviewHostname) so the Turnstile gate
 * and this helper cannot disagree.
 */
export function isPreviewDeployment() {
  if (typeof window === 'undefined') return false;
  return isPreviewHostname(window.location.hostname);
}

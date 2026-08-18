/**
 * Whether this browser should report to PostHog at all.
 *
 * There is one PostHog project for everything, so without a gate here a local
 * dev server, a Cloudflare preview build, or a Playwright smoke run all land in
 * the same place as production traffic. Measured before this existed: localhost
 * accounted for 9.4% of all events in a 30-day window, which is enough to move
 * every number on the dashboard.
 *
 * This is an ALLOWLIST on purpose. The older `isPreviewDeployment()` helper next
 * door is a denylist, and it had already fallen behind reality — it knows about
 * `*.plot-5wr.pages.dev` but not `plot-site.pages.dev`, which was live and
 * reporting. A denylist has to be updated every time infrastructure grows a new
 * hostname; an allowlist fails closed instead.
 *
 * The same three-host rule is duplicated, deliberately, in four other places
 * that cannot import this module: apps/website/js/config.js (a plain script
 * tag), and the PostHog snippets injected by supabase/functions/title-page,
 * supabase/functions/marketing-feed, and functions/list/[id].js (Deno / Pages
 * Functions rendering HTML). Keep all five in agreement — AGENTS.md already
 * asks for the same discipline between analytics.js and config.js.
 */
const ANALYTICS_HOSTS = ['theplot.tv', 'www.theplot.tv', 'app.theplot.tv'];

export function isAnalyticsHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  return ANALYTICS_HOSTS.includes(hostname);
}

/**
 * The gate the app actually calls. `VITE_PUBLIC_POSTHOG_FORCE=1` is the escape
 * hatch for deliberately testing analytics from a dev server: it is opt-in, off
 * by default, and must never be set in CI or in the Cloudflare build env.
 */
export function analyticsAllowed() {
  if (import.meta.env.VITE_PUBLIC_POSTHOG_FORCE === '1') return true;
  return isAnalyticsHost();
}

// What a reader of theplot.tv/whats-on actually sees, reduced to a verdict.
//
// WHY: on 2026-11-06 the page served "First update lands soon." with no
// articles for about an hour (a failed read rendered as an empty 200 and was
// edge-cached; fixed in #1463). Every status check was green: the page
// returned 200, the deploys succeeded, the database was fine. Only a person
// looking at the page noticed. This judges the page by its content, the way a
// reader does, so the next one is noticed by .github/workflows/whats-on-health.yml.

// Both strings are owned by supabase/functions/marketing-feed/index.ts (and the
// unavailable one also by apps/website/functions/_lib/whats-on.js).
// scripts/tests/whatsOnHealth.test.mjs fails if either is reworded there.
export const EMPTY_STATE = 'First update lands soon.';
export const UNAVAILABLE = 'briefly unavailable';

// A healthy front page carries ~25 TMDB posters. A handful is enough to say
// the feed rendered; the empty and error pages carry none.
export const MIN_POSTERS = 3;

const POSTER = /https:\/\/image\.tmdb\.org\/t\/p\//g;

// Statuses Cloudflare uses when it turns a client away (block, rate limit).
// Plot never sends these from /whats-on, and every response Plot does send
// carries X-Plot-Cache (apps/website/functions/_lib/edgeCache.js), so one of
// these without that header is Cloudflare refusing the checker, not the page
// being down. GitHub's runners hit this: on the first manual run, 2 of 3
// attempts came back 403 while the site served readers normally.
const EDGE_REFUSALS = new Set([403, 429]);

/**
 * @param {number} status HTTP status of the page
 * @param {string} html   response body
 * @param {{ fromPlot?: boolean, mitigated?: string | null }} [edge]
 *   fromPlot: the response carried X-Plot-Cache. mitigated: its cf-mitigated header.
 * @returns {{ ok: boolean, blocked?: boolean, reason: string, posters: number }}
 */
export function classifyWhatsOn(status, html, edge = { fromPlot: true }) {
  const body = String(html || '');
  const posters = (body.match(POSTER) || []).length;
  if (edge.mitigated || (EDGE_REFUSALS.has(status) && !edge.fromPlot)) {
    const how = edge.mitigated ? `cf-mitigated: ${edge.mitigated}` : 'no X-Plot-Cache';
    return { ok: false, blocked: true, reason: `Cloudflare turned the checker away (HTTP ${status}, ${how})`, posters };
  }
  if (status !== 200) {
    const why = body.includes(UNAVAILABLE) ? ' (the "briefly unavailable" page)' : '';
    return { ok: false, reason: `HTTP ${status}${why}`, posters };
  }
  if (body.includes(EMPTY_STATE)) {
    return { ok: false, reason: `showing the empty state ("${EMPTY_STATE}")`, posters };
  }
  if (posters < MIN_POSTERS) {
    return { ok: false, reason: `only ${posters} poster image(s), expected at least ${MIN_POSTERS}`, posters };
  }
  return { ok: true, reason: `${posters} posters`, posters };
}

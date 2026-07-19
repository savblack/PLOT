// Base URL for share-link OG cards (Pages Function version of api/_og-base.js).
// On Cloudflare there is no /api/og — OG rendering is the standalone `plot-og`
// Worker — so OG_BASE_URL must be set in the Pages project to the Worker URL.
// The /api/og fallback only matters during the Vercel transition.
//
// Callers append the query string, e.g. `${ogBase(host, env)}?u=alice`.
export const ogBase = (host, env) => (env && env.OG_BASE_URL) || `https://${host}/api/og`;

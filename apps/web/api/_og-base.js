// Base URL for share-link OG cards. Underscore prefix keeps Vercel from
// treating this as a route.
//
// OG rendering was moved off Vercel to a Cloudflare Worker (apps/web/workers/og)
// because on-the-fly Satori image generation exhausted the Hobby CPU/origin
// caps and paused production. Set OG_BASE_URL in the Vercel env to the Worker
// URL to cut over; leave it unset to keep serving from /api/og on Vercel.
//
// Callers append the query string, e.g. `${ogBase(host)}?u=alice`.
export const ogBase = (host) => process.env.OG_BASE_URL || `https://${host}/api/og`;

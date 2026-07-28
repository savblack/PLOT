// Shared per-IP rate limiting for Pages Functions, using the same Cloudflare
// Rate Limiting binding pattern as the standalone og/tmdb-proxy Workers
// (see apps/web/workers/*/wrangler.toml). Requires an `RL` Ratelimit binding
// on this Pages project — see root wrangler.toml.
//
// Fails open: if the binding isn't configured (e.g. local dev, or before the
// binding is added in the dashboard), requests pass through unlimited rather
// than 500ing the page.
export async function rateLimited(request, env) {
  if (!env.RL) return false;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const { success } = await env.RL.limit({ key: ip });
  return !success;
}

export function rateLimitResponse() {
  return new Response('Too many requests', {
    status: 429,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '10' },
  });
}

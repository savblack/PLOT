// Cloudflare Pages Function — returns the visitor's IP-derived country so
// onboarding can pre-select a more accurate region than a timezone guess.
// Routing: functions/api/region.js → /api/region (called by both apps.web
// and, via https://app.theplot.tv/api/region, apps/mobile).
export async function onRequest({ request }) {
  const country = (request.cf && request.cf.country) || null;
  return new Response(JSON.stringify({ country }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Per-visitor geo data — never cache at the edge or in the browser.
      'Cache-Control': 'private, no-store',
    },
  });
}

// /api/health — the `status` link of the RFC 9727 catalog at
// /.well-known/api-catalog. Deliberately makes no upstream call: it answers
// "is theplot.tv serving its Functions?", which is the only question this host
// can answer for itself. Probing Supabase from here would turn a public,
// uncacheable URL into a free way to generate load on it.
const BODY = JSON.stringify({ status: 'pass', description: 'PLOT public API' });

export async function onRequest({ request }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Allow: 'GET, HEAD' },
    });
  }
  return new Response(request.method === 'HEAD' ? null : BODY, {
    headers: {
      // draft-inadarei-api-health-check's media type, which is what the
      // catalog advertises for this link.
      'Content-Type': 'application/health+json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

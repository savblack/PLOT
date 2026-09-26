// Real handler, no network. Verifies browser preflight and the auth boundary.
let handler: (req: Request) => Promise<Response>;
Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as typeof Deno.serve;
globalThis.fetch = () => { throw Error('Unexpected network request'); };
await import('../supabase/functions/export-user-data/index.ts');
for (const [method, expected] of [['OPTIONS', 204], ['POST', 401], ['GET', 405]] as const) {
  const response = await handler(new Request('http://localhost/export', { method, headers: { Origin: 'http://127.0.0.1:5184' } }));
  if (response.status !== expected || response.headers.get('Access-Control-Allow-Origin') !== '*') throw Error(`Failed ${method}`);
  console.log(`PASS ${method} returns ${expected} with browser-readable CORS headers`);
}

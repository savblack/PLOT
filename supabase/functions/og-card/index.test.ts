import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

// Exercise the deployed handler with real fonts and renderer. Only the pinned
// resvg WASM is fetched from the network; all data lookups are synthetic.
Deno.test('lookup and font failures stay uncacheable and recover in the same isolate', async () => {
  const realServe = Deno.serve;
  const realFetch = globalThis.fetch;
  let handler!: (request: Request) => Promise<Response>;
  let mode = 'font-failure';
  let failedPath = 'public_profiles';
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', 'content-range': '0-0/0' },
  });
  Deno.serve = ((callback: typeof handler) => { handler = callback; return {}; }) as typeof Deno.serve;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol === 'data:' || url.hostname === 'unpkg.com') return realFetch(input, init);
    if (url.pathname.startsWith('/fonts/')) {
      if (mode === 'font-failure' && url.pathname.includes('Gabarito')) return new Response(null, { status: 503 });
      return new Response(await Deno.readFile(new URL(`../../../apps/web/public${url.pathname}`, import.meta.url)));
    }
    if (mode === 'network-failure') throw new Error('synthetic network outage');
    if (mode === 'lookup-failure' && url.pathname.endsWith(failedPath)) return json({ code: 'PGRST002' }, 503);
    if (mode === 'bad-json') return new Response('{');
    if (url.pathname.endsWith('public_profiles')) return json(mode === 'missing' ? [] : [{ id: 'synthetic-profile', username: 'example', display_name: 'Example' }]);
    return json([]);
  }) as typeof fetch;
  try {
    await import('./index.ts');
    const request = () => handler(new Request('https://example.test/og?u=example'));
    let result = await request();
    assertEquals(result.status, 503);
    assertEquals(result.headers.get('cache-control'), 'no-store');
    mode = 'healthy';
    result = await request();
    assertEquals(result.status, 200);
    assertMatch(result.headers.get('content-type')!, /^image\//);
    assertMatch(result.headers.get('cache-control')!, /s-maxage=604800/);
    await result.arrayBuffer();
    for (const failedPathValue of ['public_profiles', 'history', 'get_follow_counts']) {
      failedPath = failedPathValue;
      mode = 'lookup-failure';
      result = await request();
      assertEquals(result.status, 503);
      assertEquals(result.headers.get('cache-control'), 'no-store');
    }
    for (const failure of ['network-failure', 'bad-json']) {
      mode = failure;
      result = await request();
      assertEquals(result.status, 503);
      assertEquals(result.headers.get('cache-control'), 'no-store');
    }
    for (const [param, path] of [['list', 'get_shared_list'], ['post', 'feed_posts']]) {
      failedPath = path;
      mode = 'lookup-failure';
      result = await handler(new Request(`https://example.test/og?${param}=00000000-0000-4000-8000-000000000001`));
      assertEquals(result.status, 503);
      assertEquals(result.headers.get('cache-control'), 'no-store');
      mode = 'missing';
      result = await handler(new Request(`https://example.test/og?${param}=00000000-0000-4000-8000-000000000001`));
      assertEquals(result.status, 200);
      assertMatch(result.headers.get('cache-control')!, /s-maxage=300/);
      await result.arrayBuffer();
    }
    mode = 'missing';
    result = await request();
    assertEquals(result.status, 200);
    assertMatch(result.headers.get('cache-control')!, /s-maxage=300/);
    await result.arrayBuffer();
    mode = 'healthy';
    result = await request();
    assertEquals(result.status, 200);
    assertMatch(result.headers.get('cache-control')!, /s-maxage=604800/);
    await result.arrayBuffer();
  } finally {
    Deno.serve = realServe;
    globalThis.fetch = realFetch;
  }
});

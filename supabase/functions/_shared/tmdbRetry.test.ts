// When tmdbGetWithRetry waits, when it gives up, and that the API key never
// reaches an error message (these land in the function log).
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { retryAfterMs, tmdbGetWithRetry } from './tmdbRetry.ts';

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** A fetch that plays back these responses in order, and a sleep that records its waits. */
function harness(responses: Array<Response | Error>) {
  const waits: number[] = [];
  const urls: string[] = [];
  let i = 0;
  return {
    waits,
    urls,
    options: {
      fetchImpl: ((url: string) => {
        urls.push(url);
        const next = responses[Math.min(i++, responses.length - 1)];
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next.clone());
      }) as unknown as typeof fetch,
      sleep: (ms: number) => { waits.push(ms); return Promise.resolve(); },
    },
  };
}

Deno.test('a good response is returned with one call and no waiting', async () => {
  const h = harness([reply(200, { results: {} })]);
  assertEquals(await tmdbGetWithRetry('/movie/-1/watch/providers', 'k', h.options), { results: {} });
  assertEquals(h.urls.length, 1);
  assertEquals(h.waits, []);
});

Deno.test('a 5xx is retried with growing waits until it works', async () => {
  const h = harness([reply(503), reply(502), reply(200, { ok: true })]);
  assertEquals(await tmdbGetWithRetry('/movie/-1/watch/providers', 'k', { ...h.options, baseDelayMs: 100 }), { ok: true });
  assertEquals(h.urls.length, 3);
  assertEquals(h.waits, [100, 200]);
});

Deno.test('a 429 waits as long as Retry-After asks, up to the cap', async () => {
  const h = harness([reply(429, {}, { 'Retry-After': '2' }), reply(429, {}, { 'Retry-After': '60' }), reply(200, {})]);
  await tmdbGetWithRetry('/movie/-1/watch/providers', 'k', { ...h.options, maxDelayMs: 5000 });
  assertEquals(h.waits, [2000, 5000]);
});

Deno.test('a 404 is the answer: thrown at once, never retried', async () => {
  const h = harness([reply(404)]);
  await assertRejects(() => tmdbGetWithRetry('/movie/-1/watch/providers', 'k', h.options), Error, 'failed (404)');
  assertEquals(h.urls.length, 1);
  assertEquals(h.waits, []);
});

Deno.test('it gives up after the attempts and reports the last status', async () => {
  const h = harness([reply(500), reply(500), reply(500), reply(200, {})]);
  await assertRejects(() => tmdbGetWithRetry('/movie/-1/watch/providers', 'k', h.options), Error, 'failed (500)');
  assertEquals(h.urls.length, 3);
});

Deno.test('a network error is retried', async () => {
  const h = harness([new TypeError('connection reset'), reply(200, { ok: 1 })]);
  assertEquals(await tmdbGetWithRetry('/movie/-1/watch/providers', 'k', h.options), { ok: 1 });
  assertEquals(h.urls.length, 2);
});

Deno.test('the API key is sent but never appears in an error', async () => {
  const h = harness([new TypeError('could not reach https://api.themoviedb.org/3/x?api_key=SECRET')]);
  const err = await assertRejects(() => tmdbGetWithRetry('/movie/-1/watch/providers', 'SECRET', { ...h.options, attempts: 1 }));
  assert(h.urls[0].includes('api_key=SECRET'));
  assert(!(err as Error).message.includes('SECRET'));
});

Deno.test('retryAfterMs reads seconds and dates, and ignores junk', () => {
  assertEquals(retryAfterMs('3'), 3000);
  assertEquals(retryAfterMs('0'), 0);
  assertEquals(retryAfterMs(new Date(10_000).toUTCString(), 4_000), 6_000);
  assertEquals(retryAfterMs(new Date(1_000).toUTCString(), 9_000), 0);
  assertEquals(retryAfterMs(null), null);
  assertEquals(retryAfterMs('soon'), null);
});

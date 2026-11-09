// rows() must tell a failed read from an empty one: marketing-feed relies on
// it so a database error answers 503 instead of a cached empty page.
import { assertEquals, assertInstanceOf, assertThrows } from 'jsr:@std/assert@1';
import { QueryFailed, rows } from './queryRows.ts';

Deno.test('rows returns data, including an empty result', () => {
  assertEquals(rows({ data: [{ slug: 'a' }], error: null }), [{ slug: 'a' }]);
  assertEquals(rows({ data: [], error: null }), []);
  assertEquals(rows({ data: null, error: null }), null); // maybeSingle() with no match
});

Deno.test('rows throws QueryFailed when the read errored', () => {
  const err = assertThrows(
    () => rows({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }),
  );
  assertInstanceOf(err, QueryFailed);
  assertEquals((err as Error).message, 'query failed: canceling statement due to statement timeout');
});

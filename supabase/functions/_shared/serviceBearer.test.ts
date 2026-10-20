import { assertEquals } from 'jsr:@std/assert@1';
import { hasServiceKeyBearer } from './serviceBearer.ts';

const req = (authorization?: string) =>
  new Request('https://example.test', { headers: authorization ? { Authorization: authorization } : {} });

Deno.test('accepts exactly the configured key', () => {
  assertEquals(hasServiceKeyBearer(req('Bearer sb_secret_abc123'), 'sb_secret_abc123'), true);
  assertEquals(hasServiceKeyBearer(req('bearer sb_secret_abc123'), 'sb_secret_abc123'), true);
});

Deno.test('rejects a different key, a prefix match, or no bearer', () => {
  assertEquals(hasServiceKeyBearer(req('Bearer sb_secret_abc124'), 'sb_secret_abc123'), false);
  assertEquals(hasServiceKeyBearer(req('Bearer sb_secret_abc'), 'sb_secret_abc123'), false);
  assertEquals(hasServiceKeyBearer(req('Bearer sb_secret_abc123extra'), 'sb_secret_abc123'), false);
  assertEquals(hasServiceKeyBearer(req('sb_secret_abc123'), 'sb_secret_abc123'), false);
  assertEquals(hasServiceKeyBearer(req(), 'sb_secret_abc123'), false);
});

Deno.test('never matches when no key is configured', () => {
  assertEquals(hasServiceKeyBearer(req('Bearer '), ''), false);
  assertEquals(hasServiceKeyBearer(req(''), ''), false);
});

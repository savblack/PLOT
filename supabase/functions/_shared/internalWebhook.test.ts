// This gate is the only thing standing between a public POST and the internal
// webhook handlers (notify-feedback, profiles-changed, notify-signup), so both
// halves matter: it must accept what the database triggers actually send, and
// reject anything a browser could be holding.
//
// The accept side is not theoretical: a rejection is invisible, because the
// trigger function warns rather than raising, so feedback notifications and
// Brevo sync would simply stop.
//
// Since 2026-10-14 the gate compares the bearer to the keys the function holds
// (SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY) rather than trusting a prefix or
// an unverified JWT claim. Keys are injected here so the tests need no env.
import { assertEquals } from 'jsr:@std/assert@1';
import { hasServiceRoleBearer } from './internalWebhook.ts';

const SECRET = 'sb_secret_abcdef1234567890';
// Shaped like the legacy JWT only loosely: the gate compares bytes, not claims.
const LEGACY = 'legacy-service-role-key-value';
const KEYS = [SECRET, LEGACY];

const req = (authorization?: string) =>
  new Request('https://example.test/', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
  });

Deno.test('accepts the configured secret key', () => {
  assertEquals(hasServiceRoleBearer(req(`Bearer ${SECRET}`), KEYS), true);
});

Deno.test('accepts the platform service-role key too, so both work mid-rotation', () => {
  assertEquals(hasServiceRoleBearer(req(`Bearer ${LEGACY}`), KEYS), true);
});

Deno.test('rejects a different key with the secret prefix: the prefix proves nothing', () => {
  assertEquals(hasServiceRoleBearer(req('Bearer sb_secret_somethingelse'), KEYS), false);
});

Deno.test('rejects a JWT that merely claims service_role', () => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const claimed = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'service_role' })}.forged`;
  assertEquals(hasServiceRoleBearer(req(`Bearer ${claimed}`), KEYS), false);
});

Deno.test('rejects a publishable key, the one a browser can hold', () => {
  assertEquals(hasServiceRoleBearer(req('Bearer sb_publishable_abcdef1234567890'), KEYS), false);
});

Deno.test('rejects a missing or malformed Authorization header', () => {
  assertEquals(hasServiceRoleBearer(req(), KEYS), false);
  assertEquals(hasServiceRoleBearer(req(''), KEYS), false);
  assertEquals(hasServiceRoleBearer(req(SECRET), KEYS), false);
  assertEquals(hasServiceRoleBearer(req('Bearer '), KEYS), false);
});

Deno.test('rejects everything when no key is configured', () => {
  assertEquals(hasServiceRoleBearer(req(`Bearer ${SECRET}`), []), false);
});

Deno.test('case-insensitive scheme, per the RFC and the original behaviour', () => {
  assertEquals(hasServiceRoleBearer(req(`bearer ${SECRET}`), KEYS), true);
  assertEquals(hasServiceRoleBearer(req(`BEARER ${SECRET}`), KEYS), true);
});

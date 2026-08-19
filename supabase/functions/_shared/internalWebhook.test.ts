// This gate is the only thing standing between a public POST and the internal
// webhook handlers (notify-feedback, profiles-changed, notify-signup), so both
// halves matter: it must accept what the database triggers actually send, and
// reject anything a browser could be holding.
//
// The accept side is not theoretical. The bearer in Vault becomes an
// `sb_secret_*` key when the legacy service_role JWT is retired, and a rejection
// there is invisible — the trigger function warns rather than raising, so
// feedback notifications and Brevo sync would simply stop.
import { assertEquals } from 'jsr:@std/assert@1';
import { hasServiceRoleBearer } from './internalWebhook.ts';

const req = (authorization?: string) =>
  new Request('https://example.test/', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
  });

/** Unsigned, but the gateway verifies signatures before this runs — only claims matter here. */
const jwtWithRole = (role: string) => {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role })}.signature`;
};

Deno.test('accepts a new-style secret key', () => {
  assertEquals(hasServiceRoleBearer(req('Bearer sb_secret_abcdef1234567890')), true);
});

Deno.test('accepts a legacy service_role JWT, so both work mid-rotation', () => {
  assertEquals(hasServiceRoleBearer(req(`Bearer ${jwtWithRole('service_role')}`)), true);
});

Deno.test('rejects a publishable key — the one a browser can hold', () => {
  assertEquals(hasServiceRoleBearer(req('Bearer sb_publishable_abcdef1234567890')), false);
});

Deno.test('rejects anon and authenticated JWTs', () => {
  assertEquals(hasServiceRoleBearer(req(`Bearer ${jwtWithRole('anon')}`)), false);
  assertEquals(hasServiceRoleBearer(req(`Bearer ${jwtWithRole('authenticated')}`)), false);
});

Deno.test('rejects a missing or malformed Authorization header', () => {
  assertEquals(hasServiceRoleBearer(req()), false);
  assertEquals(hasServiceRoleBearer(req('')), false);
  assertEquals(hasServiceRoleBearer(req('sb_secret_no_bearer_prefix')), false);
  assertEquals(hasServiceRoleBearer(req('Bearer not-a-jwt')), false);
  assertEquals(hasServiceRoleBearer(req('Bearer ')), false);
});

Deno.test('does not accept a key that merely contains the prefix', () => {
  // Guards against a substring check creeping in: this must be a prefix test,
  // or a user-supplied string could smuggle the prefix past it.
  assertEquals(hasServiceRoleBearer(req('Bearer not_sb_secret_abcdef')), false);
  assertEquals(hasServiceRoleBearer(req(`Bearer ${jwtWithRole('anon')}sb_secret_x`)), false);
});

Deno.test('case-insensitive scheme, per the RFC and the original behaviour', () => {
  assertEquals(hasServiceRoleBearer(req('bearer sb_secret_abcdef1234567890')), true);
  assertEquals(hasServiceRoleBearer(req('BEARER sb_secret_abcdef1234567890')), true);
});

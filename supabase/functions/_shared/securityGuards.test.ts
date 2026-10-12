import { assertEquals } from 'jsr:@std/assert@1';
import { confirmedPremium, usableRateCount } from './securityGuards.js';

Deno.test('calendar events require a confirmed Premium response', () => {
  assertEquals(confirmedPremium({ data: true, error: null }), true);
  assertEquals(confirmedPremium({ data: false, error: null }), false);
  assertEquals(confirmedPremium({ data: true, error: { message: 'RPC unavailable' } }), false);
  assertEquals(confirmedPremium({ data: null, error: null }), false);
});

Deno.test('signup refuses an errored or malformed rate check', () => {
  assertEquals(usableRateCount({ data: 1, error: null }), 1);
  assertEquals(usableRateCount({ data: 1, error: { message: 'RPC unavailable' } }), null);
  assertEquals(usableRateCount({ data: null, error: null }), null);
  assertEquals(usableRateCount({ data: -1, error: null }), null);
  assertEquals(usableRateCount({ data: Number.NaN, error: null }), null);
});

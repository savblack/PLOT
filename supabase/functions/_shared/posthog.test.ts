import { normaliseCurrency, normaliseMajorAmount } from './posthog.ts';

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}

Deno.test('monetization currency values are canonical ISO codes', () => {
  equal(normaliseCurrency(' aud '), 'AUD');
  equal(normaliseCurrency('usd'), 'USD');
  equal(normaliseCurrency('AUSD'), null);
  equal(normaliseCurrency(null), null);
});

Deno.test('monetization amounts accept numeric strings but reject invalid values', () => {
  equal(normaliseMajorAmount('5.00'), 5);
  equal(normaliseMajorAmount('1,234.50'), 1234.5);
  equal(normaliseMajorAmount(24), 24);
  equal(normaliseMajorAmount('not-a-number'), null);
  equal(normaliseMajorAmount(null), null);
});

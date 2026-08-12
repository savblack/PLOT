import assert from 'node:assert/strict';
import test from 'node:test';
import { edgeFunctionUrl } from '@plot/core/functions.js';

test('edgeFunctionUrl returns null when Supabase URL is not configured', () => {
  assert.equal(edgeFunctionUrl('calendar-feed', { token: 'token-123' }), null);
});

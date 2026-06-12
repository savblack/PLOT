import assert from 'node:assert/strict';
import test from 'node:test';
import { itemMatchesPlatformFilters } from '../../src/utils/watchlistFilters.js';

test('itemMatchesPlatformFilters keeps items visible when no platform filters are active', () => {
  assert.equal(itemMatchesPlatformFilters({ provider_ids: [] }, []), true);
});

test('itemMatchesPlatformFilters hides items with unknown providers when a platform filter is active', () => {
  assert.equal(itemMatchesPlatformFilters({ provider_ids: [] }, [8]), false);
  assert.equal(itemMatchesPlatformFilters({}, [8]), false);
});

test('itemMatchesPlatformFilters matches items that include a selected provider', () => {
  assert.equal(itemMatchesPlatformFilters({ provider_ids: [8, 9] }, [9]), true);
  assert.equal(itemMatchesPlatformFilters({ provider_ids: [8, 9] }, [15]), false);
});

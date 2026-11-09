import assert from 'node:assert/strict';
import test from 'node:test';

import { drilldownParams, parseDrilldown, drilldownFilter, drilldownEventProps } from '../../historyDrilldown.js';

const toParams = (obj) => new URLSearchParams(obj);

test('drilldown params round-trip for every stat', () => {
  for (const d of [
    { stat: 'titles', year: 2026 },
    { stat: 'genre', year: 2026, genre: 18 },
    { stat: 'weekday', year: 2025, weekday: 0 },
  ]) {
    assert.deepEqual(parseDrilldown(toParams(drilldownParams(d))), d);
  }
});

test('parseDrilldown treats a malformed or incomplete URL as no drill-down', () => {
  assert.equal(parseDrilldown(toParams({})), null);
  assert.equal(parseDrilldown(toParams({ stat: 'genre', year: '2026' })), null);
  assert.equal(parseDrilldown(toParams({ stat: 'genre', year: '2026', genre: 'x' })), null);
  assert.equal(parseDrilldown(toParams({ stat: 'weekday', year: '2026', weekday: '9' })), null);
  assert.equal(parseDrilldown(toParams({ stat: 'network', year: '2026' })), null);
  assert.equal(parseDrilldown(toParams({ stat: 'titles', year: 'abc' })), null);
});

test('drilldownFilter hands filterEntries only what the tile set', () => {
  assert.deepEqual(drilldownFilter(null), {});
  assert.deepEqual(drilldownFilter({ stat: 'titles', year: 2026 }), { year: 2026 });
  assert.deepEqual(drilldownFilter({ stat: 'genre', year: 2026, genre: 18 }), { year: 2026, genres: [18] });
  assert.deepEqual(drilldownFilter({ stat: 'weekday', year: 2026, weekday: 5 }), { year: 2026, weekday: 5 });
});

test('drilldownEventProps names the stat and where it was tapped, never the genre or title', () => {
  assert.deepEqual(drilldownEventProps({ stat: 'genre', year: 2026, genre: 18 }, 'web'), { stat: 'genre', source: 'web' });
});

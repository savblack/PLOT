import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppearance as serverIsAppearance } from '../../../../supabase/functions/_shared/premiumAlerts.js';
import { isAppearance as clientIsAppearance } from '../../../../packages/core/peopleFeed.js';

// The server (who gets a release-day alert, what goes in people_feed) and the
// client (a person page's Coming up strip) must agree on what an appearance
// is. Edge functions cannot import packages/core, so the rule exists twice;
// this keeps the copies in step.
const cases = [
  { character: 'Self' },
  { character: 'Himself - Guest' },
  { character: 'Herself (archive footage)' },
  { character: 'Themselves' },
  { character: 'Selfridge' },
  { character: 'Mara' },
  { character: '' },
  {},
  { genre_ids: [10763] },
  { genre_ids: [10764, 18] },
  { genre_ids: [10767] },
  { genre_ids: [18, 35] },
  { character: 'Ellis', genre_ids: [10767] },
];

test('client and server agree on appearances', () => {
  for (const credit of cases) {
    assert.equal(clientIsAppearance(credit), serverIsAppearance(credit), JSON.stringify(credit));
  }
  assert.equal(clientIsAppearance({ character: 'Selfridge' }), false);
});

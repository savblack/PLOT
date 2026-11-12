import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIVATION_NUDGE_SOURCE_IDS, activationNudgeSources, shouldShowActivationNudge } from '../../activationNudge.js';
import { ACTIVATION_NUDGE } from '../../copy/activationNudge.js';
import { EVENTS } from '../../analyticsEvents.js';

const empty = { ready: true, watchlistCount: 0, watchingCount: 0, historyCount: 0 };

test('shows only once every read has answered and the account has no titles', () => {
  assert.equal(shouldShowActivationNudge(empty), true);
  assert.equal(shouldShowActivationNudge({ ...empty, ready: false }), false);
  assert.equal(shouldShowActivationNudge({ ...empty, historyCount: null }), false);
});

test('one title anywhere is enough to hide it: there is no target', () => {
  assert.equal(shouldShowActivationNudge({ ...empty, watchlistCount: 1 }), false);
  assert.equal(shouldShowActivationNudge({ ...empty, watchingCount: 1 }), false);
  assert.equal(shouldShowActivationNudge({ ...empty, historyCount: 1 }), false);
  assert.doesNotMatch(`${ACTIVATION_NUDGE.title} ${ACTIVATION_NUDGE.body}`, /\b5\b|five/i);
});

test('only confirmed sources are offered, Trakt first, Simkl only with its client id', () => {
  assert.deepEqual([...ACTIVATION_NUDGE_SOURCE_IDS], ['trakt', 'simkl']);
  assert.deepEqual(activationNudgeSources({ simklClientId: 'id' }).map(s => s.id), ['trakt', 'simkl']);
  assert.deepEqual(activationNudgeSources({}).map(s => s.id), ['trakt']);
  // Turning TV Time on does not add it: it is not confirmed end to end.
  assert.deepEqual(activationNudgeSources({ simklClientId: 'id', tvTimeImportEnabled: true }).map(s => s.id), ['trakt', 'simkl']);
});

test('copy has no em dash and the three events exist', () => {
  for (const value of Object.values(ACTIVATION_NUDGE)) {
    assert.doesNotMatch(typeof value === 'function' ? value('Trakt') : value, /—/);
  }
  assert.equal(ACTIVATION_NUDGE.importFrom('Trakt'), 'Import from Trakt');
  assert.equal(EVENTS.ACTIVATION_NUDGE_SHOWN, 'activation_nudge_shown');
  assert.equal(EVENTS.ACTIVATION_NUDGE_ADD_CLICKED, 'activation_nudge_add_clicked');
  assert.equal(EVENTS.ACTIVATION_NUDGE_IMPORT_CLICKED, 'activation_nudge_import_clicked');
});

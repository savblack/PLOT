import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAUNCH_FEATURES,
  SHOW_MEDIA_INTEGRATIONS,
  SHOW_PUBLIC_PROFILES,
} from '../../src/constants/launchFeatures.js';

test('launch-deferred features stay disabled in the public app', () => {
  assert.equal(SHOW_PUBLIC_PROFILES, false);
  assert.equal(SHOW_MEDIA_INTEGRATIONS, false);
  assert.deepEqual(LAUNCH_FEATURES, {
    publicProfiles: false,
    mediaIntegrations: false,
  });
});

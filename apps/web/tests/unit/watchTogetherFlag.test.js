import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Watch together is on for web and mobile (PLO-515)', () => {
  const web = read('../../src/launchFeatures.js');
  const mobile = read('../../../mobile/lib/launchFeatures.ts');

  // Launched in the build. Only the PostHog kill switch (docs/ops/kill-switches.md)
  // may take it away at run time, and only through featureOn().
  assert.match(web, /const WATCH_TOGETHER_LAUNCHED = true;/);
  assert.match(web, /export const SHOW_WATCH_TOGETHER = featureOn\('watchTogether', WATCH_TOGETHER_LAUNCHED, KILLED_AT_LOAD\);/);
  assert.doesNotMatch(web, /VITE_SHOW_WATCH_TOGETHER/);
  assert.doesNotMatch(web, /isPreviewDeployment/);
  assert.match(mobile, /export const SHOW_WATCH_TOGETHER = true/);
  assert.doesNotMatch(mobile, /EXPO_PUBLIC_SHOW_WATCH_TOGETHER/);
});

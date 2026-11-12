import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWebVitalsProperties,
  isHumanWebVitalsHost,
  isTrustedHumanInteraction,
} from '../../src/lib/webVitals.js';

test('web vitals are scoped to the production app host', () => {
  assert.equal(isHumanWebVitalsHost('app.theplot.tv'), true);
  assert.equal(isHumanWebVitalsHost('theplot.tv'), false);
  assert.equal(isHumanWebVitalsHost('www.theplot.tv'), false);
  assert.equal(isHumanWebVitalsHost('localhost'), false);
});

test('only trusted visible interactions start capture', () => {
  assert.equal(isTrustedHumanInteraction({ isTrusted: true }, 'visible'), true);
  assert.equal(isTrustedHumanInteraction({ isTrusted: false }, 'visible'), false);
  assert.equal(isTrustedHumanInteraction({ isTrusted: true }, 'hidden'), false);
});

test('web vitals payload keeps metric values and strips performance entries', () => {
  const payload = buildWebVitalsProperties([
    {
      id: 'v1',
      name: 'LCP',
      value: 1840,
      delta: 1840,
      rating: 'good',
      entries: [{ target: null }],
    },
  ], 'https://app.theplot.tv/plans');

  assert.equal(payload.$current_url, 'https://app.theplot.tv/plans');
  assert.equal(payload.$web_vitals_enabled_server_side, false);
  assert.equal(payload.$web_vitals_LCP_value, 1840);
  assert.deepEqual(payload.$web_vitals_LCP_event, {
    id: 'v1', name: 'LCP', value: 1840, delta: 1840, rating: 'good',
  });
  assert.equal('$web_vitals_LCP_event' in payload, true);
});

test('web vitals are filed under the page that loaded, not the live location', () => {
  // posthog-js fills $pathname from window.location at send time, which by
  // then may be a different in-app page (#1596). The payload must override it.
  const payload = buildWebVitalsProperties(
    [{ name: 'LCP', value: 7092 }],
    'https://app.theplot.tv/signup',
  );
  assert.equal(payload.$current_url, 'https://app.theplot.tv/signup');
  assert.equal(payload.$pathname, '/signup');
});

test('an empty page URL leaves $pathname to posthog-js', () => {
  const payload = buildWebVitalsProperties([{ name: 'FCP', value: 900 }]);
  assert.equal('$pathname' in payload, false);
});

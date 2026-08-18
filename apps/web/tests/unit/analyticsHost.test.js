import assert from 'node:assert/strict';
import test from 'node:test';

import { isAnalyticsHost } from '../../src/utils/analyticsHost.js';

test('production hosts report analytics', () => {
  assert.equal(isAnalyticsHost('theplot.tv'), true);
  assert.equal(isAnalyticsHost('www.theplot.tv'), true);
  assert.equal(isAnalyticsHost('app.theplot.tv'), true);
});

test('local dev servers never report', () => {
  // Every port a dev server or automation harness has actually used shows up as
  // the same hostname, so the port is irrelevant to the check.
  assert.equal(isAnalyticsHost('localhost'), false);
  assert.equal(isAnalyticsHost('127.0.0.1'), false);
});

test('preview and branch deploys never report', () => {
  assert.equal(isAnalyticsHost('preview.theplot.tv'), false);
  assert.equal(isAnalyticsHost('plot-site.pages.dev'), false);
  assert.equal(isAnalyticsHost('bd0aed9b.plot-site.pages.dev'), false);
  // The old isPreviewDeployment() denylist knew this one but not the two above,
  // which is the reason this helper is an allowlist.
  assert.equal(isAnalyticsHost('ebd9f144.plot-5wr.pages.dev'), false);
});

test('a lookalike host cannot opt itself in', () => {
  assert.equal(isAnalyticsHost('theplot.tv.evil.com'), false);
  assert.equal(isAnalyticsHost('nottheplot.tv'), false);
  assert.equal(isAnalyticsHost('admin.theplot.tv'), false);
});

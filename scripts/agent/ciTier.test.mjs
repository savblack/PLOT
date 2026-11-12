import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChanges } from './ciTier.mjs';

test('docs and marketing markdown skip the install', () => {
  const result = classifyChanges([
    'docs/ops/actions-minutes.md',
    'marketing/README.md',
    'README.md',
  ]);
  assert.equal(result.tier, 'none');
});

test('a workflow file is not a docs-only diff', () => {
  const result = classifyChanges(['.github/workflows/pr-title.yml']);
  assert.equal(result.tier, 'fast');
});

test('core logic stays on the fast tier', () => {
  const result = classifyChanges([
    'packages/core/profile.js',
    'supabase/migrations/20261017000000_example.sql',
  ]);
  assert.equal(result.tier, 'fast');
  assert.equal(result.websiteStorybook, false);
});

test('an app change is full', () => {
  assert.equal(classifyChanges(['apps/web/src/components/Save.jsx'], { branch: 'agent/x' }).tier, 'full');
  assert.equal(classifyChanges(['apps/web/src/styles/app.css'], { branch: 'agent/x' }).tier, 'full');
});

test('a full-ci marker in the commit message raises the tier', () => {
  const docs = classifyChanges(['docs/ops/agent-worktrees.md'], {
    commitMessage: 'docs: note the move\n\n[full-ci]',
  });
  assert.equal(docs.tier, 'full');
});

test('website and mobile Storybook builds follow their own story files', () => {
  const result = classifyChanges([
    'apps/website/stories/Tokens.stories.js',
    'apps/mobile/.storybook-web/preview.jsx',
  ]);
  assert.equal(result.tier, 'full');
  assert.equal(result.websiteStorybook, true);
  assert.equal(result.mobileStorybook, true);
});

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
  assert.equal(result.chromatic, false);
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
  assert.equal(result.chromatic, false);
  assert.equal(result.websiteStorybook, false);
});

test('an app change is full, and Chromatic waits for main or a visual diff', () => {
  const files = ['apps/web/src/components/Save.jsx'];
  assert.equal(classifyChanges(files, { branch: 'agent/x' }).chromatic, false);
  assert.equal(classifyChanges(files, { branch: 'main' }).chromatic, true);
  assert.equal(classifyChanges(['apps/web/src/styles/app.css'], { branch: 'agent/x' }).chromatic, true);
});

test('full-ci and visual markers in the commit message raise the tier', () => {
  const docs = classifyChanges(['docs/ops/agent-worktrees.md'], {
    commitMessage: 'docs: note the move\n\n[full-ci]',
  });
  assert.equal(docs.tier, 'full');
  const visual = classifyChanges(['apps/web/src/components/Save.jsx'], {
    branch: 'agent/x',
    commitMessage: 'fix: save label [visual]',
  });
  assert.equal(visual.chromatic, true);
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

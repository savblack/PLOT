import test from 'node:test';
import assert from 'node:assert/strict';
import { prScopeRefusal, prNumberFromAttachments, PR_BRANCH_PREFIX } from '../../supabase/functions/_shared/linearIssue.js';

// The PR a Linear card points at comes from an attachment, and attachments are
// editable by anyone who can edit the issue. These checks are what stop a
// re-pointed card from merging an arbitrary pull request into main.
const refreshPr = {
  head: { ref: 'timeline-refresh/2026-09-14' },
  user: { login: 'github-actions[bot]' },
};

test('a genuine refresh PR is allowed', () => {
  assert.equal(prScopeRefusal(refreshPr), null);
  assert.equal(prScopeRefusal({ ...refreshPr, user: { login: 'app/github-actions' } }), null);
});

test('refuses a PR on any other branch', () => {
  const r = prScopeRefusal({ ...refreshPr, head: { ref: 'feat/something-else' } });
  assert.match(r, /not a .*refresh/);
});

test('refuses a human-authored PR even on a matching branch', () => {
  // The branch prefix is guessable — this is the check that makes it not enough.
  const r = prScopeRefusal({ ...refreshPr, user: { login: 'savblack' } });
  assert.match(r, /not the refresh bot/);
});

test('refuses when either field is missing entirely', () => {
  assert.ok(prScopeRefusal({}));
  assert.ok(prScopeRefusal({ head: { ref: PR_BRANCH_PREFIX + 'x' } }));
  assert.ok(prScopeRefusal({ user: { login: 'github-actions[bot]' } }));
  assert.ok(prScopeRefusal(null));
});

test('a branch that merely contains the prefix is not a match', () => {
  assert.ok(prScopeRefusal({ ...refreshPr, head: { ref: `evil/${PR_BRANCH_PREFIX}2026-09-14` } }));
});

test('only PR links in our own repo are recognised', () => {
  assert.equal(prNumberFromAttachments([{ url: 'https://github.com/savblack/PLOT/pull/631' }], 'savblack/PLOT'), 631);
  assert.equal(prNumberFromAttachments([{ url: 'https://github.com/attacker/PLOT/pull/1' }], 'savblack/PLOT'), null);
  assert.equal(prNumberFromAttachments([{ url: 'https://linear.app/savblack/issue/PLO-1' }], 'savblack/PLOT'), null);
  assert.equal(prNumberFromAttachments([], 'savblack/PLOT'), null);
  assert.equal(prNumberFromAttachments(undefined, 'savblack/PLOT'), null);
});

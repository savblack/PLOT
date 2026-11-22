import assert from 'node:assert/strict';
import test from 'node:test';
import { changedPaths, worktreeFinished } from './worktreeFinished.mjs';

const merged = {
  isMain: false,
  isCurrent: false,
  changedFiles: [],
  branch: 'agent/2026-11-16-import-failures',
  head: 'abc123',
  pr: { state: 'MERGED', headRefOid: 'abc123', number: 1699 },
};

test('a merged worktree with nothing extra is finished', () => {
  assert.deepEqual(worktreeFinished(merged), { finished: true, reason: 'pull request #1699 merged' });
});

test('a leftover handoff note does not keep a merged worktree', () => {
  assert.equal(worktreeFinished({ ...merged, changedFiles: ['AGENT_HANDOFF.md'] }).finished, true);
});

test('unsaved edits keep a merged worktree', () => {
  const result = worktreeFinished({ ...merged, changedFiles: ['AGENT_HANDOFF.md', 'apps/web/src/App.jsx'] });
  assert.deepEqual(result, { finished: false, reason: '1 unsaved change' });
});

test('a commit after the merge keeps the worktree', () => {
  assert.equal(worktreeFinished({ ...merged, head: 'def456' }).finished, false);
});

test('open, missing, or unknown pull requests keep the worktree', () => {
  assert.equal(worktreeFinished({ ...merged, pr: { state: 'OPEN', headRefOid: 'abc123', number: 1 } }).finished, false);
  assert.equal(worktreeFinished({ ...merged, pr: { state: 'CLOSED', headRefOid: 'abc123', number: 1 } }).finished, false);
  assert.equal(worktreeFinished({ ...merged, pr: null }).reason, 'no pull request yet');
  assert.equal(worktreeFinished({ ...merged, pr: undefined }).reason, 'could not check GitHub');
});

test('the main checkout and the current worktree are never finished', () => {
  assert.equal(worktreeFinished({ ...merged, isMain: true }).finished, false);
  assert.equal(worktreeFinished({ ...merged, isCurrent: true }).finished, false);
});

test('a detached worktree is finished only when its code is on main', () => {
  const detached = { ...merged, branch: '', pr: undefined };
  assert.equal(worktreeFinished({ ...detached, detachedOnMain: true }).finished, true);
  assert.equal(worktreeFinished({ ...detached, detachedOnMain: false }).finished, false);
});

test('porcelain lines become paths', () => {
  assert.deepEqual(changedPaths('?? AGENT_HANDOFF.md\n M apps/web/a.js\nR  old.js -> new.js\n'), ['AGENT_HANDOFF.md', 'apps/web/a.js', 'new.js']);
});

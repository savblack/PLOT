import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeChecks, judgeCodeql } from '../../../../scripts/auto-merge.mjs';

const SHA = 'abc';
const codeql = { name: 'CodeQL', status: 'completed', conclusion: 'success', app: { slug: 'github-advanced-security' } };
const ci = { path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: SHA, status: 'completed', conclusion: 'success' };

test('real CodeQL and CI results pass', () => {
  assert.deepEqual(judgeChecks([codeql], [], [ci], SHA), { pending: [], failed: [], missing: [] });
});

test('a workflow job named "CodeQL" does not count as the real CodeQL scan', () => {
  const fake = { ...codeql, app: { slug: 'github-actions' } };
  assert.deepEqual(judgeChecks([fake], [], [ci], SHA).missing, ['CodeQL']);
});

test('a run from another workflow file does not count as CI, whatever it is called', () => {
  const other = { ...ci, path: '.github/workflows/ci-copy.yml' };
  assert.deepEqual(judgeChecks([codeql], [], [other], SHA).missing, ['CI']);
});

test('a CI run started by hand or for another commit does not count', () => {
  assert.deepEqual(judgeChecks([codeql], [], [{ ...ci, event: 'workflow_dispatch' }], SHA).missing, ['CI']);
  assert.deepEqual(judgeChecks([codeql], [], [{ ...ci, head_sha: 'old' }], SHA).missing, ['CI']);
});

test('the latest CI run decides: a newer failure beats an older pass', () => {
  const r = judgeChecks([codeql], [], [{ ...ci, conclusion: 'failure' }, ci], SHA);
  assert.deepEqual(r.failed, ['CI (failure)']);
});

test('a status that merely borrows a name still fails the PR when red', () => {
  const st = { context: 'CI', state: 'failure', creator: { login: 'savblack' } };
  assert.deepEqual(judgeChecks([codeql], [st], [ci], SHA).failed, ['CI (failure)']);
});

test('any failing run with a required name fails, even beside a passing one', () => {
  const failing = { ...codeql, conclusion: 'failure' };
  assert.deepEqual(judgeChecks([codeql, failing], [], [ci], SHA).failed, ['CodeQL (failure)']);
});

test('pending checks are waited on, not treated as missing', () => {
  const r = judgeChecks([{ ...codeql, status: 'in_progress', conclusion: null }], [], [{ ...ci, status: 'in_progress', conclusion: null }], SHA);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.pending.sort(), ['CI', 'CodeQL']);
});

const KEY = 'dynamic/github-code-scanning/codeql:analyze';
const analysis = (category, extra = {}) => ({ commit_sha: 'abc', tool: { name: 'CodeQL' }, analysis_key: KEY, category, error: '', ...extra });
const both = [analysis('/language:javascript-typescript'), analysis('/language:actions')];

test('CodeQL: both default-setup analyses of this exact commit and no open alerts pass', () => {
  assert.deepEqual(judgeCodeql(both, 'abc', 0), []);
});

test('CodeQL: a missing language, an older commit or an errored scan waits', () => {
  assert.equal(judgeCodeql([both[1]], 'abc', 0).length, 1);
  assert.equal(judgeCodeql(both.map((a) => ({ ...a, commit_sha: 'old' })), 'abc', 0).length, 2);
  assert.match(judgeCodeql([analysis('/language:javascript-typescript', { error: 'boom' }), both[1]], 'abc', 0)[0], /errored/);
});

test('CodeQL: an uploaded result under another key blocks, and so does any open alert', () => {
  const uploaded = analysis('/language:javascript-typescript', { analysis_key: '.github/workflows/fake.yml:scan' });
  assert.match(judgeCodeql([...both, uploaded], 'abc', 0)[0], /did not come from GitHub's own setup/);
  assert.match(judgeCodeql(both, 'abc', 1)[0], /open code-scanning alert/);
});

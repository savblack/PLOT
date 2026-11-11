import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeChecks, judgeCodeql } from '../../../../scripts/auto-merge.mjs';

const codeql = { name: 'CodeQL', status: 'completed', conclusion: 'success', app: { slug: 'github-advanced-security' } };
const circle = { context: 'ci/circleci: check', state: 'success', creator: { login: 'circleci-app[bot]' } };

test('real CodeQL and CircleCI results pass', () => {
  assert.deepEqual(judgeChecks([codeql], [circle]), { pending: [], failed: [], missing: [] });
});

test('a workflow job named "CodeQL" does not count as the real CodeQL scan', () => {
  const fake = { ...codeql, app: { slug: 'github-actions' } };
  assert.deepEqual(judgeChecks([fake], [circle]).missing, ['CodeQL']);
});

test('a CircleCI-named status from a workflow token neither counts nor hides a real failure', () => {
  const spoof = { context: 'ci/circleci: check', state: 'success', creator: { login: 'github-actions[bot]' } };
  const realFail = { ...circle, state: 'failure' };
  const r = judgeChecks([codeql], [spoof, realFail]);
  assert.deepEqual(r.failed, ['ci/circleci: check (failure)']);
  assert.deepEqual(judgeChecks([codeql], [spoof]).missing, ['ci/circleci: check']);
});

test('any failing run with a required name fails, even beside a passing one', () => {
  const failing = { ...codeql, conclusion: 'failure' };
  assert.deepEqual(judgeChecks([codeql, failing], [circle]).failed, ['CodeQL (failure)']);
});

test('pending checks are waited on, not treated as missing', () => {
  const r = judgeChecks([{ ...codeql, status: 'in_progress', conclusion: null }], [{ ...circle, state: 'pending' }]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.pending.sort(), ['CodeQL', 'ci/circleci: check']);
});

test('a CircleCI-named status under a person account does not count', () => {
  const asUser = { ...circle, creator: { login: 'savblack' } };
  assert.deepEqual(judgeChecks([codeql], [asUser]).missing, ['ci/circleci: check']);
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

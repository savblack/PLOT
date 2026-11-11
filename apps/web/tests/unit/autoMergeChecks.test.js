import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeChecks } from '../../../../scripts/auto-merge.mjs';

const strix = { name: 'Strix Security Review', status: 'completed', conclusion: 'success', app: { slug: 'strix-security' } };
const circle = { context: 'ci/circleci: check', state: 'success', creator: { login: 'circleci-app[bot]' } };

test('real Strix and CircleCI results pass', () => {
  assert.deepEqual(judgeChecks([strix], [circle]), { pending: [], failed: [], missing: [] });
});

test('a workflow job named "Strix Security Review" does not count as Strix', () => {
  const fake = { ...strix, app: { slug: 'github-actions' } };
  assert.deepEqual(judgeChecks([fake], [circle]).missing, ['Strix Security Review']);
});

test('a CircleCI-named status from a workflow token neither counts nor hides a real failure', () => {
  const spoof = { context: 'ci/circleci: check', state: 'success', creator: { login: 'github-actions[bot]' } };
  const realFail = { ...circle, state: 'failure' };
  const r = judgeChecks([strix], [spoof, realFail]);
  assert.deepEqual(r.failed, ['ci/circleci: check (failure)']);
  assert.deepEqual(judgeChecks([strix], [spoof]).missing, ['ci/circleci: check']);
});

test('any failing run with a required name fails, even beside a passing one', () => {
  const failing = { ...strix, conclusion: 'failure' };
  assert.deepEqual(judgeChecks([strix, failing], [circle]).failed, ['Strix Security Review (failure)']);
});

test('pending checks are waited on, not treated as missing', () => {
  const r = judgeChecks([{ ...strix, status: 'in_progress', conclusion: null }], [{ ...circle, state: 'pending' }]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.pending.sort(), ['Strix Security Review', 'ci/circleci: check']);
});

test('a CircleCI-named status under a person account does not count', () => {
  const asUser = { ...circle, creator: { login: 'savblack' } };
  assert.deepEqual(judgeChecks([strix], [asUser]).missing, ['ci/circleci: check']);
});

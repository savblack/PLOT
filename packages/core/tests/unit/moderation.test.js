import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReport, reasonLabel, REPORT_REASONS, REPORT_SURFACES, REPORT_DETAIL_MAX,
} from '../../moderation.js';
import { MODERATION } from '../../copy/moderation.js';

// These ids are the exact values the reports table's check constraints accept.
// If this file and the migration disagree, every submission fails with an
// opaque 23514 and the reporter sees "we could not send that report".

test('reason ids match the check constraint in 20260912130000_report_and_block', () => {
  assert.deepEqual(
    [...REPORT_REASONS].sort(),
    ['harassment', 'hate', 'impersonation', 'other', 'sexual', 'spam'],
  );
});

test('surface ids match the check constraint', () => {
  assert.deepEqual(
    [...REPORT_SURFACES].sort(),
    ['follow_request', 'profile', 'search_result', 'suggested_user'],
  );
});

test('every reason offered in the picker is one the database accepts', () => {
  for (const reason of MODERATION.REASONS) {
    assert.ok(REPORT_REASONS.includes(reason.id), `${reason.id} is not an accepted reason`);
    assert.ok(reason.label.length > 0, `${reason.id} has no label`);
  }
});

test('a valid report passes and is shaped for the insert', () => {
  const result = validateReport({
    reportedId: 'user-b', reporterId: 'user-a',
    surface: 'profile', reason: 'harassment', detail: '  they keep messaging me  ',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    reported_id: 'user-b',
    reporter_id: 'user-a',
    surface: 'profile',
    reason: 'harassment',
    detail: 'they keep messaging me',
  });
});

test('empty detail becomes null, not an empty string', () => {
  // The column is nullable, and "said nothing" should not render as an empty
  // quote block in the Linear issue.
  const result = validateReport({
    reportedId: 'b', reporterId: 'a', surface: 'profile', reason: 'spam', detail: '   ',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.detail, null);
});

test('a missing reason asks for one rather than failing opaquely', () => {
  const result = validateReport({ reportedId: 'b', reporterId: 'a', surface: 'profile' });
  assert.equal(result.ok, false);
  assert.equal(result.error, MODERATION.chooseReason);
});

test('an unknown reason is rejected before it reaches the constraint', () => {
  const result = validateReport({
    reportedId: 'b', reporterId: 'a', surface: 'profile', reason: 'because-i-said-so',
  });
  assert.equal(result.ok, false);
});

test('an unknown surface is rejected', () => {
  const result = validateReport({
    reportedId: 'b', reporterId: 'a', surface: 'dm', reason: 'spam',
  });
  assert.equal(result.ok, false);
});

test('reporting yourself is rejected, matching the insert policy', () => {
  const result = validateReport({
    reportedId: 'a', reporterId: 'a', surface: 'profile', reason: 'spam',
  });
  assert.equal(result.ok, false);
});

test('detail over the column limit is caught with a readable message', () => {
  const result = validateReport({
    reportedId: 'b', reporterId: 'a', surface: 'profile', reason: 'other',
    detail: 'x'.repeat(REPORT_DETAIL_MAX + 1),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, MODERATION.detailTooLong);
});

test('detail exactly at the limit is allowed', () => {
  const result = validateReport({
    reportedId: 'b', reporterId: 'a', surface: 'profile', reason: 'other',
    detail: 'x'.repeat(REPORT_DETAIL_MAX),
  });
  assert.equal(result.ok, true);
});

test('reasonLabel renders a submitted report back, and degrades to the id', () => {
  assert.equal(reasonLabel('harassment'), 'Harassment or bullying');
  assert.equal(reasonLabel('nonexistent'), 'nonexistent');
});

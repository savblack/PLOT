import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anonymizedFeedbackReporter,
  buildFeedbackAttachmentPath,
  feedbackTypeLabel,
} from '../../src/utils/feedback.js';

test('feedbackTypeLabel falls back to general feedback', () => {
  assert.equal(feedbackTypeLabel('bug'), 'Bug report');
  assert.equal(feedbackTypeLabel('unknown'), 'General feedback');
});

test('anonymizedFeedbackReporter hides direct user identity', () => {
  assert.equal(
    anonymizedFeedbackReporter({ userId: 'user-123', userEmail: 'user@example.com' }),
    'Signed-in Plot user'
  );
  assert.equal(anonymizedFeedbackReporter({}), 'Anonymous visitor');
});

test('buildFeedbackAttachmentPath removes user-derived names from storage paths', () => {
  assert.equal(
    buildFeedbackAttachmentPath('screenshot.PNG', 'fixed-id'),
    'feedback/fixed-id.png'
  );
  assert.equal(
    buildFeedbackAttachmentPath('no-extension', 'fixed-id'),
    'feedback/fixed-id'
  );
});

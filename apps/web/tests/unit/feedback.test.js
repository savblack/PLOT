import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anonymizedFeedbackReporter,
  buildFeedbackAttachmentPath,
  buildFeedbackLinearTitle,
  feedbackTypeLabel,
} from '../../src/utils/feedback.js';

test('feedbackTypeLabel falls back to general feedback', () => {
  assert.equal(feedbackTypeLabel('bug'), 'Bug report');
  assert.equal(feedbackTypeLabel('unknown'), 'General feedback');
});

test('anonymizedFeedbackReporter hides direct user identity', () => {
  assert.equal(
    anonymizedFeedbackReporter({ userId: 'user-123', userEmail: 'user@example.com' }),
    'Signed-in PLOT user'
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

test('buildFeedbackLinearTitle creates compact Linear-ready summaries', () => {
  assert.equal(
    buildFeedbackLinearTitle('feature', 'Add a way to pin favourite seasonal lists for quick access'),
    'Feature request: Add a way to pin favourite seasonal lists for quick access'
  );
  assert.equal(
    buildFeedbackLinearTitle('bug', ''),
    'Bug report: Untitled'
  );
});

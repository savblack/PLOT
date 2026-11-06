import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anonymizedFeedbackReporter,
  buildFeedbackAttachmentPath,
  FEEDBACK_ATTACHMENT_URL_TTL_SECONDS,
  feedbackAttachmentSignedUrl,
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

test('feedback screenshots are signed for one year instead of published', async () => {
  let seen = null;
  const result = await feedbackAttachmentSignedUrl({
    from(bucket) {
      return {
        createSignedUrl(path, expiresIn) {
          seen = { bucket, path, expiresIn };
          return Promise.resolve({ data: { signedUrl: 'https://proj.supabase.co/storage/v1/object/sign/feedback-attachments/' + path + '?token=1' }, error: null });
        },
      };
    },
  }, 'feedback/fixed-id.png');
  assert.equal(seen.bucket, 'feedback-attachments');
  assert.equal(seen.expiresIn, 31536000);
  assert.equal(seen.expiresIn, FEEDBACK_ATTACHMENT_URL_TTL_SECONDS);
  assert.equal(result.url.includes('/object/sign/'), true);
  assert.equal(result.error, null);
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

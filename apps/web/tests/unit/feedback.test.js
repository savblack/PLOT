import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  anonymizedFeedbackReporter,
  buildFeedbackAttachmentPath,
  FEEDBACK_ATTACHMENT_MIME_TYPES,
  FEEDBACK_ATTACHMENT_URL_TTL_SECONDS,
  feedbackAttachmentSignedUrl,
  feedbackTypeLabel,
  isAllowedFeedbackAttachment,
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

test('feedback screenshots are raster only, matching the bucket', () => {
  assert.equal(isAllowedFeedbackAttachment({ type: 'image/png' }), true);
  assert.equal(isAllowedFeedbackAttachment({ type: 'image/jpeg' }), true);
  assert.equal(isAllowedFeedbackAttachment({ type: 'image/svg+xml' }), false);
  assert.equal(isAllowedFeedbackAttachment({ type: 'text/html' }), false);
  assert.equal(isAllowedFeedbackAttachment({ type: '' }), false);
  assert.equal(isAllowedFeedbackAttachment(null), false);

  const migration = readFileSync(new URL('../../../../supabase/migrations/20261118100000_storage_bucket_hardening.sql', import.meta.url), 'utf8');
  const bucketTypes = migration.match(/allowed_mime_types = array\[([^\]]+)\]/)[1]
    .split(',').map((t) => t.trim().replace(/'/g, ''));
  assert.deepEqual(bucketTypes, [...FEEDBACK_ATTACHMENT_MIME_TYPES]);
});

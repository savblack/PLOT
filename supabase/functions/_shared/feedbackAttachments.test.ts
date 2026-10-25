import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  FEEDBACK_ATTACHMENT_URL_TTL_SECONDS,
  attachmentPathsFrom,
  feedbackAttachmentPath,
  signedFeedbackUrl,
} from './feedbackAttachments.ts';

const PATH = 'feedback/11111111-1111-4111-8111-111111111111.png';

Deno.test('public, signed, and raw feedback paths all resolve to the object path', () => {
  assertEquals(
    feedbackAttachmentPath(`https://proj.supabase.co/storage/v1/object/public/feedback-attachments/${PATH}`),
    PATH,
  );
  assertEquals(
    feedbackAttachmentPath(`https://proj.supabase.co/storage/v1/object/sign/feedback-attachments/${PATH}?token=abc`),
    PATH,
  );
  assertEquals(feedbackAttachmentPath(PATH), PATH);
});

Deno.test('a path that escapes the feedback prefix is ignored', () => {
  assertEquals(
    feedbackAttachmentPath('https://proj.supabase.co/storage/v1/object/public/feedback-attachments/../secret.png'),
    null,
  );
  assertEquals(feedbackAttachmentPath('https://evil.example/feedback/nope.png'), null);
  assertEquals(attachmentPathsFrom(['nope', 12, PATH]).length, 1);
});

Deno.test('Notion links are signed for one year, not published as public object urls', async () => {
  let expiry = 0;
  let bucket = '';
  const url = await signedFeedbackUrl({
    storage: {
      from(name: string) {
        bucket = name;
        return {
          createSignedUrl(_path: string, expiresIn: number) {
            expiry = expiresIn;
            return Promise.resolve({ data: { signedUrl: 'https://proj.supabase.co/storage/v1/object/sign/feedback-attachments/' + PATH + '?token=ok' }, error: null });
          },
        };
      },
    },
  }, PATH);
  assertEquals(bucket, 'feedback-attachments');
  assertEquals(expiry, 31_536_000);
  assertEquals(expiry, FEEDBACK_ATTACHMENT_URL_TTL_SECONDS);
  assertEquals(url.includes('/object/sign/'), true);
  assertEquals(url.includes('/object/public/'), false);
});

Deno.test('a signing failure does not fall back to a public url', async () => {
  await assertRejects(
    () => signedFeedbackUrl({
      storage: {
        from() {
          return {
            createSignedUrl() {
              return Promise.resolve({ data: null, error: { message: 'denied' } });
            },
          };
        },
      },
    }, PATH),
    Error,
    'Failed to sign feedback attachment',
  );
});

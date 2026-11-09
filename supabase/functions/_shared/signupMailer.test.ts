import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { deliverSignupLink } from './signupMailer.ts';

Deno.test('reports sent when Resend accepts the message', async () => {
  const logs: string[] = [];
  const result = await deliverSignupLink(() => Promise.resolve(), (m) => logs.push(m));
  assertEquals(result, 'sent');
  assertEquals(logs, ['[signup-bypass] confirmation email path: resend']);
});

Deno.test('reports failed when Resend fails, without throwing or trying another mailer', async () => {
  const logs: string[] = [];
  const result = await deliverSignupLink(
    () => Promise.reject(new Error('Resend request failed (503)')),
    (m) => logs.push(m),
  );
  assertEquals(result, 'failed');
  assertEquals(logs.length, 1);
  assertStringIncludes(logs[0], 'Resend request failed (503)');
});

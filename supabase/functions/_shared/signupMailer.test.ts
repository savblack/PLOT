import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { sendBrevoTransactionalEmail } from './brevo.ts';
import { deliverSignupLink, type SignupMailSender } from './signupMailer.ts';

function sender(name: string, outcome: 'ok' | 'fail', calls: string[]): SignupMailSender {
  return {
    name,
    send: () => {
      calls.push(name);
      return outcome === 'ok' ? Promise.resolve() : Promise.reject(new Error(`${name} request failed (503)`));
    },
  };
}

Deno.test('uses Resend and never calls Brevo when Resend works', async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const result = await deliverSignupLink([sender('resend', 'ok', calls), sender('brevo', 'ok', calls)], (m) => logs.push(m));
  assertEquals(result, 'sent');
  assertEquals(calls, ['resend']);
  assertEquals(logs, ['[signup-bypass] confirmation email path: resend']);
});

Deno.test('falls back to Brevo when Resend fails', async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const result = await deliverSignupLink([sender('resend', 'fail', calls), sender('brevo', 'ok', calls)], (m) => logs.push(m));
  assertEquals(result, 'sent');
  assertEquals(calls, ['resend', 'brevo']);
  assertEquals(logs, [
    '[signup-bypass] resend failed (resend request failed (503))',
    '[signup-bypass] confirmation email path: brevo',
  ]);
});

Deno.test('reports failed, without throwing, only when every provider fails', async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const result = await deliverSignupLink([sender('resend', 'fail', calls), sender('brevo', 'fail', calls)], (m) => logs.push(m));
  assertEquals(result, 'failed');
  assertEquals(calls, ['resend', 'brevo']);
  assertEquals(logs.at(-1), '[signup-bypass] every email path failed');
});

Deno.test('Brevo email is plain text from the given sender to one address', async () => {
  let url = '';
  let init: RequestInit | undefined;
  await sendBrevoTransactionalEmail({
    apiKey: ' key ',
    sender: { name: 'Plot', email: 'hello@theplot.tv' },
    to: 'reader@example.com',
    subject: 'Confirm your Plot account',
    text: 'Open https://app.theplot.tv/auth/callback?x=1',
    fetchImpl: (input, req) => {
      url = input;
      init = req;
      return Promise.resolve(new Response(JSON.stringify({ messageId: 'm' }), { status: 201 }));
    },
  });
  assertEquals(url, 'https://api.brevo.com/v3/smtp/email');
  assertEquals(init?.method, 'POST');
  assertEquals((init?.headers as Record<string, string>)['api-key'], 'key');
  const body = JSON.parse(String(init?.body));
  assertEquals(body, {
    sender: { name: 'Plot', email: 'hello@theplot.tv' },
    to: [{ email: 'reader@example.com' }],
    subject: 'Confirm your Plot account',
    textContent: 'Open https://app.theplot.tv/auth/callback?x=1',
  });
  // No HTML body: Brevo's click tracking would rewrite the sign-in link.
  assertEquals('htmlContent' in body, false);
});

Deno.test('a Brevo error names the status but not the response body', async () => {
  const err = await assertRejects(
    () => sendBrevoTransactionalEmail({
      apiKey: 'key',
      sender: { name: 'Plot', email: 'hello@theplot.tv' },
      to: 'reader@example.com',
      subject: 's',
      text: 't',
      fetchImpl: () => Promise.resolve(new Response('{"message":"reader@example.com is blocked"}', { status: 400 })),
    }),
    Error,
  );
  assertEquals(err.message, 'Brevo email request failed (400)');
});

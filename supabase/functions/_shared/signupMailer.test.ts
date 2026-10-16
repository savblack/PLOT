import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { deliverSignupLink } from './signupMailer.ts';

const fail = (m: string) => () => Promise.reject(new Error(m));
const ok = () => Promise.resolve();

Deno.test('uses Resend and skips Supabase when Resend works', async () => {
  let supabaseCalls = 0;
  const logs: string[] = [];
  const path = await deliverSignupLink(ok, () => { supabaseCalls++; return Promise.resolve(); }, (m) => logs.push(m));
  assertEquals(path, 'resend');
  assertEquals(supabaseCalls, 0);
  assertEquals(logs, ['[signup-bypass] confirmation email path: resend']);
});

Deno.test('falls back to Supabase mailer when Resend fails', async () => {
  const logs: string[] = [];
  const path = await deliverSignupLink(fail('Resend request failed (401)'), ok, (m) => logs.push(m));
  assertEquals(path, 'supabase');
  assertEquals(logs.at(-1), '[signup-bypass] confirmation email path: supabase');
});

Deno.test('throws only when both paths fail', async () => {
  await assertRejects(
    () => deliverSignupLink(fail('a'), fail('b'), () => {}),
    Error,
    'both confirmation email paths failed',
  );
});

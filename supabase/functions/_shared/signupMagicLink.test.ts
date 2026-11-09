import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { deliverMagicLink, exactAuthUser, findAuthUserByEmail, linkDeliveryError, replacementPassword, type AuthAccount, type LinkResult } from './signupMagicLink.ts';

type Admin = Parameters<typeof deliverMagicLink>[0];

function fixture({
  generatedNew = false,
  missing = false,
  mailResult = 'sent' as LinkResult,
  existing,
  updateFailures = 0,
  withdrawFails = false,
}: {
  generatedNew?: boolean;
  missing?: boolean;
  mailResult?: LinkResult;
  existing?: AuthAccount | null;
  updateFailures?: number;
  withdrawFails?: boolean;
} = {}) {
  const deleted: string[] = [];
  const redirects: string[] = [];
  const mailed: string[] = [];
  const passwords: { id: string; password: string }[] = [];
  const order: string[] = [];
  const linkTypes: string[] = [];
  const account = existing !== undefined
    ? existing
    : (generatedNew || missing ? null : { id: 'existing-user', confirmed: true });
  let calls = 0;
  let updates = 0;
  const admin = {
    findUserByEmail: () => {
      order.push('lookup');
      return Promise.resolve(account);
    },
    updateUserById: (id: string, attrs: { password?: string }) => {
      order.push('update');
      updates += 1;
      passwords.push({ id, password: String(attrs.password || '') });
      const fail = updates <= updateFailures;
      return Promise.resolve(fail
        ? { data: { user: null }, error: { message: 'update failed' } }
        : { data: { user: { id } }, error: null });
    },
    generateLink: ({ type, options }: { type?: string; options: { redirectTo: string } }) => {
      order.push('generate');
      linkTypes.push(type ?? '');
      redirects.push(options.redirectTo);
      calls++;
      if (missing && calls === 1) {
        return Promise.resolve({ data: null, error: { message: 'User with this email not found' } });
      }
      if (withdrawFails && calls > 1) {
        return Promise.resolve({ data: null, error: { message: 'withdraw failed' } });
      }
      return Promise.resolve({ data: {
        user: { id: generatedNew || missing ? 'new-user' : account?.id || 'existing-user' },
        properties: {
          action_link: 'https://example.test/verify',
          email_otp: '123456',
          verification_type: generatedNew && calls === 1 ? 'signup' : 'magiclink',
        },
      }, error: null });
    },
    deleteUser: (id: string) => { deleted.push(id); return Promise.resolve({ data: { user: null }, error: null }); },
  } as unknown as Admin;
  const codes: (string | undefined)[] = [];
  const mail = (_email: string, _link: string, action: string, _redirect: string, code?: string) => {
    order.push('mail');
    mailed.push(action);
    codes.push(code);
    return Promise.resolve(mailResult);
  };
  return { admin, mail, deleted, redirects, mailed, passwords, order, linkTypes, codes };
}

Deno.test('a failed email removes the account created implicitly by generateLink', async () => {
  const f = fixture({ generatedNew: true, mailResult: 'failed' });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'new@example.test', null, 'magiclink', false), 'failed');
  assertEquals(f.deleted, ['new-user']);
});

Deno.test('new magic-link signup uses the signup callback and retains a delivered account', async () => {
  const f = fixture({ generatedNew: true });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'new@example.test', null, 'magiclink', false), 'sent');
  assertEquals(new URL(f.redirects.at(-1)!).searchParams.get('from'), 'signup');
  assertEquals(f.mailed, ['signup']);
  assertEquals(f.deleted, []);
  assertEquals(f.order.filter((step) => step === 'generate').length, 1);
});

Deno.test('an app request sends the app deep link for new and existing accounts', async () => {
  const fresh = fixture({ generatedNew: true });
  assertEquals(await deliverMagicLink(fresh.admin, fresh.mail, 'new@example.test', null, 'magiclink', true, 'app'), 'sent');
  assertEquals(fresh.redirects, ['plot://auth/callback']);

  const member = fixture({});
  assertEquals(await deliverMagicLink(member.admin, member.mail, 'member@example.test', null, 'magiclink', false, 'app'), 'sent');
  assertEquals(member.redirects.every((url) => url === 'plot://auth/callback'), true);
});

Deno.test('only an app request puts the six-digit code in the email', async () => {
  const app = fixture({});
  await deliverMagicLink(app.admin, app.mail, 'member@example.test', null, 'magiclink', false, 'app');
  assertEquals(app.codes, ['123456']);

  const web = fixture({});
  await deliverMagicLink(web.admin, web.mail, 'member@example.test', null, 'magiclink', false);
  assertEquals(web.codes, [undefined]);
});

Deno.test('failed mail never deletes an existing account', async () => {
  const f = fixture({ mailResult: 'failed' });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'member@example.test', null, 'magiclink', false), 'failed');
  assertEquals(f.deleted, []);
});

Deno.test('resend for an unknown address does not call generateLink', async () => {
  const f = fixture({ existing: null });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'missing@example.test', null, 'resend', true), 'absent');
  assertEquals(f.order, ['lookup']);
  assertEquals(f.deleted, []);
  assertEquals(f.mailed, []);
  assertEquals(f.passwords, []);
});

Deno.test('signup for an unknown address does not call generateLink', async () => {
  const f = fixture({ existing: null });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'missing@example.test', null, 'signup', true), 'absent');
  assertEquals(f.order, ['lookup']);
});

Deno.test('a missing-user response from generateLink stays generic and does not create a user', async () => {
  const f = fixture({ missing: true });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'missing@example.test', null, 'magiclink', false), 'absent');
  assertEquals(f.deleted, []);
  assertEquals(f.mailed, []);
});

Deno.test('a failed confirmation email does not rotate an unconfirmed password', async () => {
  const f = fixture({ existing: { id: 'pending-user', confirmed: false }, mailResult: 'failed' });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'pending@example.test', null, 'resend', true), 'failed');
  assertEquals(f.order, ['lookup', 'generate', 'mail']);
  assertEquals(f.passwords, []);
  assertEquals(f.mailed, ['resend']);
  assertEquals(f.deleted, []);
});

Deno.test('an accepted confirmation email rotates an unconfirmed password afterwards', async () => {
  const f = fixture({ existing: { id: 'pending-user', confirmed: false } });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'pending@example.test', null, 'signup', true), 'sent');
  assertEquals(f.order, ['lookup', 'generate', 'mail', 'update']);
  assertEquals(f.passwords.length, 1);
  assertEquals(f.passwords[0].id, 'pending-user');
  assertEquals(f.passwords[0].password.length >= 32, true);
  assertEquals(f.mailed, ['signup']);
  assertEquals(f.deleted, []);
});

Deno.test('resend for an unconfirmed account rotates only after the mailer accepts the link', async () => {
  const f = fixture({ existing: { id: 'pending-user', confirmed: false } });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'pending@example.test', null, 'resend', true), 'sent');
  assertEquals(f.order, ['lookup', 'generate', 'mail', 'update']);
  assertEquals(f.passwords.length, 1);
});

Deno.test('a confirmed account keeps its password', async () => {
  const f = fixture({ existing: { id: 'member', confirmed: true } });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'member@example.test', null, 'signup', true), 'sent');
  assertEquals(f.passwords, []);
  assertEquals(f.order, ['lookup', 'generate', 'mail']);
});

Deno.test('a failed password update is retried once and then the link is sent', async () => {
  const f = fixture({ existing: { id: 'pending-user', confirmed: false }, updateFailures: 1 });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'pending@example.test', null, 'signup', true), 'sent');
  assertEquals(f.order, ['lookup', 'generate', 'mail', 'update', 'update']);
  assertEquals(f.passwords.length, 2);
  assertEquals(f.passwords[0].password === f.passwords[1].password, false);
  assertEquals(f.mailed, ['signup']);
  assertEquals(f.deleted, []);
});

Deno.test('two failed password updates withdraw the emailed magic link', async () => {
  const f = fixture({ existing: { id: 'pending-user', confirmed: false }, updateFailures: 2 });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'pending@example.test', null, 'resend', true), 'withdrawn');
  assertEquals(f.order, ['lookup', 'generate', 'mail', 'update', 'update', 'generate']);
  assertEquals(f.linkTypes, ['magiclink', 'magiclink']);
  assertEquals(f.mailed, ['resend']);
  assertEquals(f.deleted, []);
  const failure = linkDeliveryError('withdrawn');
  assertEquals(failure?.reason, 'link_withdrawn');
  assertEquals(failure?.error.includes('could not send'), false);
  assertEquals(failure?.error.includes('We emailed a sign-in link'), true);
  assertEquals(linkDeliveryError('failed')?.reason, 'email_failed');
});

Deno.test('a failed withdrawal does not claim the emailed link was cancelled', async () => {
  const f = fixture({ existing: { id: 'pending-user', confirmed: false }, updateFailures: 2, withdrawFails: true });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'pending@example.test', null, 'signup', true), 'withdraw_failed');
  assertEquals(f.linkTypes, ['magiclink', 'magiclink']);
  assertEquals(f.order, ['lookup', 'generate', 'mail', 'update', 'update', 'generate']);
  assertEquals(f.mailed, ['signup']);
  assertEquals(f.deleted, []);
  const failure = linkDeliveryError('withdraw_failed');
  assertEquals(failure?.reason, 'link_withdraw_failed');
  assertEquals(failure?.error.includes('cancelled'), false);
  assertEquals(failure?.error.includes('could not'), true);
  assertEquals(failure?.error.includes('Do not open it'), true);
});

Deno.test('replacement passwords always contain every character class', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const password = replacementPassword();
    assertEquals(password.length, 32);
    assertEquals(/[A-Z]/.test(password), true);
    assertEquals(/[a-z]/.test(password), true);
    assertEquals(/[0-9]/.test(password), true);
    assertEquals(/[!@#$%^&*_\-+=]/.test(password), true);
    seen.add(password);
  }
  assertEquals(seen.size > 1, true);
});

Deno.test('exact email match ignores a longer address that contains it', () => {
  const users = [
    { id: 'decoy', email: 'not-user@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
    { id: 'real', email: 'User@example.com', confirmed_at: null, email_confirmed_at: null },
  ];
  assertEquals(exactAuthUser(users, 'user@example.com'), { id: 'real', confirmed: false });
  assertEquals(exactAuthUser(users, 'other@example.com'), null);
});

Deno.test('lookup uses the admin list and returns the exact address', async () => {
  const seen: string[] = [];
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url.pathname + url.search);
    return Promise.resolve(new Response(JSON.stringify({
      users: [
        { id: 'decoy', email: 'not-user@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
        { id: 'real', email: 'user@example.com', email_confirmed_at: '2026-02-01T00:00:00Z' },
      ],
    }), { status: 200 }));
  };
  const found = await findAuthUserByEmail('https://example.supabase.co', 'service-key', 'user@example.com', fetchImpl as typeof fetch);
  assertEquals(found, { id: 'real', confirmed: true });
  assertEquals(seen[0].includes('filter=user%40example.com'), true);
});

Deno.test('lookup failure is an error, not a missing account', async () => {
  const fetchImpl = () => Promise.resolve(new Response('no', { status: 500 }));
  await assertRejects(
    () => findAuthUserByEmail('https://example.supabase.co', 'service-key', 'user@example.com', fetchImpl as typeof fetch),
    Error,
    'auth user lookup failed (500)',
  );
});

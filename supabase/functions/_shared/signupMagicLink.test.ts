import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { deliverMagicLink, exactAuthUser, findAuthUserByEmail, type AuthAccount, type LinkResult } from './signupMagicLink.ts';

type Admin = Parameters<typeof deliverMagicLink>[0];

function fixture({
  generatedNew = false,
  missing = false,
  mailResult = 'sent' as LinkResult,
  existing,
  updateFails = false,
}: {
  generatedNew?: boolean;
  missing?: boolean;
  mailResult?: LinkResult;
  existing?: AuthAccount | null;
  updateFails?: boolean;
} = {}) {
  const deleted: string[] = [];
  const redirects: string[] = [];
  const mailed: string[] = [];
  const passwords: { id: string; password: string }[] = [];
  const order: string[] = [];
  const account = existing !== undefined
    ? existing
    : (generatedNew || missing ? null : { id: 'existing-user', confirmed: true });
  let calls = 0;
  const admin = {
    findUserByEmail: () => {
      order.push('lookup');
      return Promise.resolve(account);
    },
    updateUserById: (id: string, attrs: { password?: string }) => {
      order.push('update');
      passwords.push({ id, password: String(attrs.password || '') });
      return Promise.resolve(updateFails
        ? { data: { user: null }, error: { message: 'update failed' } }
        : { data: { user: { id } }, error: null });
    },
    generateLink: ({ options }: { options: { redirectTo: string } }) => {
      order.push('generate');
      redirects.push(options.redirectTo);
      calls++;
      if (missing && calls === 1) {
        return Promise.resolve({ data: null, error: { message: 'User with this email not found' } });
      }
      return Promise.resolve({ data: {
        user: { id: generatedNew || missing ? 'new-user' : account?.id || 'existing-user' },
        properties: {
          action_link: 'https://example.test/verify',
          verification_type: generatedNew && calls === 1 ? 'signup' : 'magiclink',
        },
      }, error: null });
    },
    deleteUser: (id: string) => { deleted.push(id); return Promise.resolve({ data: { user: null }, error: null }); },
  } as unknown as Admin;
  const mail = (_email: string, _link: string, action: string) => {
    order.push('mail');
    mailed.push(action);
    return Promise.resolve(mailResult);
  };
  return { admin, mail, deleted, redirects, mailed, passwords, order };
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

Deno.test('a failed password replacement still required the link to be accepted first', async () => {
  const f = fixture({ existing: { id: 'pending-user', confirmed: false }, updateFails: true });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'pending@example.test', null, 'signup', true), 'failed');
  assertEquals(f.order, ['lookup', 'generate', 'mail', 'update']);
  assertEquals(f.mailed, ['signup']);
  assertEquals(f.deleted, []);
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

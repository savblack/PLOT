import { assertEquals } from 'jsr:@std/assert@1';
import { deliverMagicLink, type LinkResult } from './signupMagicLink.ts';

type Admin = Parameters<typeof deliverMagicLink>[0];

function fixture({ generatedNew = false, missing = false, retryFails = false, race = false, mailResult = 'sent' as LinkResult } = {}) {
  const deleted: string[] = [];
  const redirects: string[] = [];
  const mailed: string[] = [];
  let calls = 0;
  const admin = {
    generateLink: ({ options }: { options: { redirectTo: string } }) => {
      redirects.push(options.redirectTo);
      calls++;
      if ((missing && calls === 1) || (retryFails && calls > 1)) {
        return Promise.resolve({ data: null, error: { message: 'User with this email not found' } });
      }
      return Promise.resolve({ data: {
        user: { id: generatedNew || missing ? 'new-user' : 'existing-user' },
        properties: { action_link: 'https://example.test/verify', verification_type: generatedNew && calls === 1 ? 'signup' : 'magiclink' },
      }, error: null });
    },
    createUser: () => Promise.resolve(race
      ? { data: null, error: { message: 'User already registered' } }
      : { data: { user: { id: 'new-user' } }, error: null }),
    deleteUser: (id: string) => { deleted.push(id); return Promise.resolve({ error: null }); },
  } as unknown as Admin;
  const mail = (_email: string, _link: string, action: string) => {
    mailed.push(action);
    return Promise.resolve(mailResult);
  };
  return { admin, mail, deleted, redirects, mailed };
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
});

Deno.test('a second link-generation failure removes only the newly created account', async () => {
  const f = fixture({ generatedNew: true, retryFails: true });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'new@example.test', null, 'magiclink', false), 'failed');
  assertEquals(f.deleted, ['new-user']);
  assertEquals(f.mailed, []);
});

Deno.test('failed mail never deletes an existing account', async () => {
  const f = fixture({ mailResult: 'failed' });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'member@example.test', null, 'magiclink', false), 'failed');
  assertEquals(f.deleted, []);
});

Deno.test('resend for a missing account undoes implicit account creation and sends nothing', async () => {
  const f = fixture({ generatedNew: true });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'missing@example.test', null, 'resend', true), 'absent');
  assertEquals(f.deleted, ['new-user']);
  assertEquals(f.mailed, []);
});

Deno.test('a missing-user response stays generic and does not create a user', async () => {
  const f = fixture({ missing: true });
  assertEquals(await deliverMagicLink(f.admin, f.mail, 'missing@example.test', null, 'resend', true), 'absent');
  assertEquals(f.deleted, []);
  assertEquals(f.mailed, []);
});

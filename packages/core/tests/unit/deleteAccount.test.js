import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteAccountAndSignOut, parseDeleteAccountError } from '../../deleteAccount.js';

function createSupabase({ session = { access_token: 'token-123' }, signOutError = null } = {}) {
  let signOutCalls = 0;

  return {
    signOutCallsRef: () => signOutCalls,
    auth: {
      async getSession() {
        return { data: { session } };
      },
      async signOut() {
        signOutCalls += 1;
        return { error: signOutError };
      },
    },
  };
}

/* The edge function requires `confirmationPhrase` in the body and 400s
   without it. Mobile hand-rolled its own fetch with no body at all, so
   deletion always failed there while web's went through this helper and
   worked. Both apps now share this module; these two tests pin the body so a
   future caller can't quietly drop it again. */
test('deleteAccountAndSignOut sends the confirmation phrase in the request body', async () => {
  const supabase = createSupabase();
  let sent = null;

  await deleteAccountAndSignOut({
    supabase,
    deleteAccountUrl: 'https://example.com/delete-account',
    confirmationPhrase: 'delete account',
    fetchImpl: async (_url, init) => {
      sent = init;
      return { ok: true, async json() { return {}; }, async text() { return ''; } };
    },
  });

  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(sent.body), { confirmationPhrase: 'delete account' });
});

test('deleteAccountAndSignOut surfaces the phrase rejection instead of signing out', async () => {
  const supabase = createSupabase();

  const result = await deleteAccountAndSignOut({
    supabase,
    deleteAccountUrl: 'https://example.com/delete-account',
    confirmationPhrase: '',
    fetchImpl: async () => ({
      ok: false,
      async json() { return { error: 'Type "delete account" to confirm.' }; },
      async text() { return ''; },
    }),
  });

  assert.deepEqual(result, { ok: false, error: 'Type "delete account" to confirm.' });
  assert.equal(supabase.signOutCallsRef(), 0);
});

test('parseDeleteAccountError prefers JSON payload errors', async () => {
  const error = await parseDeleteAccountError({
    async json() {
      return { error: 'Delete failed upstream.' };
    },
    async text() {
      return 'fallback';
    },
  });

  assert.equal(error, 'Delete failed upstream.');
});

test('deleteAccountAndSignOut does not sign out when the delete request fails', async () => {
  const supabase = createSupabase();

  const result = await deleteAccountAndSignOut({
    supabase,
    deleteAccountUrl: 'https://example.com/delete-account',
    fetchImpl: async () => ({
      ok: false,
      async json() {
        return { error: 'Delete endpoint returned 500.' };
      },
      async text() {
        return '';
      },
    }),
  });

  assert.deepEqual(result, { ok: false, error: 'Delete endpoint returned 500.' });
  assert.equal(supabase.signOutCallsRef(), 0);
});

test('deleteAccountAndSignOut reports an expired session before calling fetch', async () => {
  const supabase = createSupabase({ session: null });
  let fetchCalls = 0;

  const result = await deleteAccountAndSignOut({
    supabase,
    deleteAccountUrl: 'https://example.com/delete-account',
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('should not run');
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /session has expired/i);
  assert.equal(fetchCalls, 0);
  assert.equal(supabase.signOutCallsRef(), 0);
});

test('deleteAccountAndSignOut signs out only after a successful delete response', async () => {
  const supabase = createSupabase();
  let redirected = false;

  const result = await deleteAccountAndSignOut({
    supabase,
    deleteAccountUrl: 'https://example.com/delete-account',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {};
      },
      async text() {
        return '';
      },
    }),
    onDeleted: async () => {
      redirected = true;
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(supabase.signOutCallsRef(), 1);
  assert.equal(redirected, true);
});

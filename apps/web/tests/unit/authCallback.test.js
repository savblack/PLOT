import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthCallback, credentialKind, ACCESS_DENIED } from '../../src/utils/authCallback.js';
import { callbackErrorCopy } from '../../src/utils/authCallbackCopy.js';
import { AUTH_CALLBACK_PAGE } from '../../src/copy/authCallbackPage.js';

// Minimal fake Supabase auth client. Each factory records what was called so we
// can assert both the decision AND that we never take a shortcut past session
// confirmation.
function fakeSupabase(overrides = {}) {
  const calls = { exchangeCodeForSession: [], verifyOtp: [], getSession: 0, onAuthStateChange: 0 };
  const auth = {
    exchangeCodeForSession: async (code) => {
      calls.exchangeCodeForSession.push(code);
      return overrides.exchange ?? { data: { session: null }, error: null };
    },
    verifyOtp: async (args) => {
      calls.verifyOtp.push(args);
      return overrides.verifyOtp ?? { data: { session: null }, error: null };
    },
    getSession: async () => {
      calls.getSession += 1;
      return overrides.getSession ?? { data: { session: null }, error: null };
    },
    onAuthStateChange: (cb) => {
      calls.onAuthStateChange += 1;
      if (overrides.onAuthStateChange) overrides.onAuthStateChange(cb);
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };
  return { supabase: { auth }, calls };
}

// Fire the timeout on the next microtask so "no session" resolves without a real
// 4s wait (deferred, not synchronous, to mirror real setTimeout ordering).
const immediateTimers = {
  setTimeoutFn: (fn) => { Promise.resolve().then(fn); return 0; },
  clearTimeoutFn: () => {},
};

test('OAuth implicit hash: awaits getSession and lands on /onboarding (no bounce to /login)', async () => {
  // The regression: a Google sign-in returns with the session in the hash.
  // getSession() resolves it (detectSessionInUrl) — we must go to /onboarding,
  // never navigate away session-less.
  const session = { user: { id: 'u1' } };
  const { supabase, calls } = fakeSupabase({ getSession: { data: { session }, error: null } });

  const result = await resolveAuthCallback(supabase, {
    search: '',
    hash: '#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer',
  });

  assert.equal(result.path, '/onboarding');
  assert.equal(result.session, session);
  assert.equal(result.error, null);
  assert.equal(calls.getSession, 1);              // it actually awaited the session
  assert.equal(calls.exchangeCodeForSession.length, 0);
});

test('never navigates onward without a session (no session anywhere → error, not /onboarding)', async () => {
  // This is the core guarantee: if no session can be confirmed, we surface an
  // error rather than dropping the user into the app logged-out (which bounced
  // them to /login in a loop).
  const { supabase, calls } = fakeSupabase(); // getSession null, no SIGNED_IN

  const result = await resolveAuthCallback(
    supabase,
    { search: '', hash: '#access_token=abc' },
    immediateTimers,
  );

  assert.equal(result.path, null);
  assert.notEqual(result.path, '/onboarding');
  assert.equal(result.session, null);
  assert.equal(result.error, 'no-session');
  assert.ok(calls.onAuthStateChange >= 1); // it tried the SIGNED_IN backstop first
});

test('backstop: a late SIGNED_IN resolves to /onboarding', async () => {
  const session = { user: { id: 'u2' } };
  const { supabase } = fakeSupabase({
    // getSession empty at first; the session arrives via onAuthStateChange.
    onAuthStateChange: (cb) => { setTimeout(() => cb('SIGNED_IN', session), 0); },
  });

  const result = await resolveAuthCallback(supabase, { search: '', hash: '#access_token=abc' }, { waitMs: 50 });

  assert.equal(result.path, '/onboarding');
  assert.equal(result.session, session);
});

test('PKCE / OAuth code in query: exchanges then goes to /onboarding', async () => {
  const session = { user: { id: 'u3' } };
  const { supabase, calls } = fakeSupabase({ exchange: { data: { session }, error: null } });

  const result = await resolveAuthCallback(supabase, { search: '?code=the-code', hash: '' });

  assert.equal(result.path, '/onboarding');
  assert.equal(result.session, session);
  assert.deepEqual(calls.exchangeCodeForSession, ['the-code']);
});

test('recovery via token_hash routes to /reset-password', async () => {
  const session = { user: { id: 'u4' } };
  const { supabase, calls } = fakeSupabase({ verifyOtp: { data: { session }, error: null } });

  const result = await resolveAuthCallback(supabase, { search: '?token_hash=h&type=recovery', hash: '' });

  assert.equal(result.path, '/reset-password');
  assert.deepEqual(calls.verifyOtp, [{ token_hash: 'h', type: 'recovery' }]);
});

test('recovery via implicit hash also routes to /reset-password', async () => {
  const session = { user: { id: 'u5' } };
  const { supabase } = fakeSupabase({ getSession: { data: { session }, error: null } });

  const result = await resolveAuthCallback(supabase, { search: '', hash: '#access_token=abc&type=recovery' });

  assert.equal(result.path, '/reset-password');
  assert.equal(result.session, session);
});

test('provider error in hash surfaces as an error, never proceeds', async () => {
  const { supabase, calls } = fakeSupabase();

  const result = await resolveAuthCallback(supabase, {
    search: '',
    hash: '#error=server_error&error_description=Unable%20to%20exchange%20external%20code',
  });

  assert.equal(result.path, null);
  assert.equal(result.error, 'Unable to exchange external code');
  assert.equal(result.cancelled, undefined);
  assert.equal(calls.getSession, 0);              // bailed before touching the client
  assert.equal(calls.exchangeCodeForSession.length, 0);
});

test('provider error with no description still surfaces the error code, never waits', async () => {
  const { supabase, calls } = fakeSupabase();

  const result = await resolveAuthCallback(supabase, { search: '?error=server_error&error_description=', hash: '' });

  assert.equal(result.path, null);
  assert.equal(result.error, 'server_error');
  assert.equal(calls.getSession, 0);
});

// The 2026-11-19 Google attempt: GoTrue sent ?error=access_denied with an EMPTY
// error_description. That used to fall through to the 4s wait and be reported
// as no_session. It is a cancel, and must be recognised as one immediately.
test('Google cancel (access_denied, empty description) is a cancel, not no-session', async () => {
  const { supabase, calls } = fakeSupabase();

  const result = await resolveAuthCallback(supabase, {
    search: '?error=access_denied&error_code=&error_description=',
    hash: '',
  });

  assert.equal(result.path, null);
  assert.equal(result.cancelled, true);
  assert.equal(result.error, ACCESS_DENIED);
  assert.equal(calls.getSession, 0);              // no session lookup, no 4s wait
  assert.equal(calls.exchangeCodeForSession.length, 0);
});

test('access_denied in the hash, with a description, is still a cancel', async () => {
  const { supabase } = fakeSupabase();

  const result = await resolveAuthCallback(supabase, {
    search: '',
    hash: '#error=access_denied&error_description=User%20denied%20access',
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.error, ACCESS_DENIED);
});

test('access_denied carried only as error_code is a cancel', async () => {
  const { supabase } = fakeSupabase();

  const result = await resolveAuthCallback(supabase, { search: '?error_code=access_denied', hash: '' });

  assert.equal(result.cancelled, true);
});

test('callback error copy: OAuth exchange failures are not called an expired link', () => {
  assert.equal(callbackErrorCopy('no-session'), AUTH_CALLBACK_PAGE.couldNotFinishSignIn);
  assert.equal(callbackErrorCopy('invalid request: both auth code and code verifier should be non-empty'), AUTH_CALLBACK_PAGE.oauthDidNotFinish);
  assert.equal(callbackErrorCopy('code challenge does not match previously saved code verifier'), AUTH_CALLBACK_PAGE.oauthDidNotFinish);
  assert.equal(callbackErrorCopy('invalid flow state, no valid flow state found'), AUTH_CALLBACK_PAGE.oauthDidNotFinish);
  assert.equal(callbackErrorCopy('Email link is invalid or has expired'), AUTH_CALLBACK_PAGE.linkExpiredOrInvalid);
});

test('exchange failure with no session anywhere surfaces the exchange error', async () => {
  const { supabase } = fakeSupabase({ exchange: { data: { session: null }, error: { message: 'bad code' } } });

  const result = await resolveAuthCallback(supabase, { search: '?code=x', hash: '' }, immediateTimers);

  assert.equal(result.path, null);
  // The specific diagnosis, not the generic 'no-session'.
  assert.equal(result.error, 'bad code');
});

test('exchange failure but a session exists: proceeds (detectSessionInUrl won the race)', async () => {
  // supabase-js has detectSessionInUrl on by default, so on client init it finds
  // `?code=` and exchanges it itself. The code is single-use, so our explicit
  // exchange then fails on a login that actually succeeded. Falling through to
  // the session check is what stops that showing the user an error screen.
  const session = { user: { id: 'u1' } };
  const { supabase, calls } = fakeSupabase({
    exchange: { data: { session: null }, error: { message: 'invalid request: both auth code and code verifier should be non-empty' } },
    getSession: { data: { session }, error: null },
  });

  const result = await resolveAuthCallback(supabase, { search: '?code=x', hash: '' }, immediateTimers);

  assert.equal(result.path, '/onboarding');
  assert.equal(result.session, session);
  assert.equal(result.error, null);
  assert.deepEqual(calls.exchangeCodeForSession, ['x']);
});

test('exchange failure on a recovery link still routes to /reset-password', async () => {
  const session = { user: { id: 'u1' } };
  const { supabase } = fakeSupabase({
    exchange: { data: { session: null }, error: { message: 'invalid code' } },
    getSession: { data: { session }, error: null },
  });

  const result = await resolveAuthCallback(supabase, { search: '?code=x&type=recovery', hash: '' }, immediateTimers);

  assert.equal(result.path, '/reset-password');
  assert.equal(result.error, null);
});

test('credentialKind names the kind of credential in the URL, never the value', () => {
  // This is what makes a failed sign-in legible after the fact without putting a
  // code or token into analytics.
  assert.equal(credentialKind('?code=abc123', ''), 'code');
  assert.equal(credentialKind('?token_hash=xyz&type=magiclink', ''), 'token_hash');
  assert.equal(credentialKind('', '#access_token=abc&refresh_token=def'), 'hash');
  assert.equal(credentialKind('', ''), 'none');
});

test('credentialKind prefers the query credential when a URL somehow carries both', () => {
  assert.equal(credentialKind('?code=abc', '#access_token=def'), 'code');
});

test('credentialKind treats an empty credential value as absent, and tolerates missing args', () => {
  assert.equal(credentialKind('?code=', ''), 'none');
  assert.equal(credentialKind(undefined, undefined), 'none');
});

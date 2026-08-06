import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthCallback } from '../../src/utils/authCallback.js';

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
    hash: '#error=access_denied&error_description=User%20denied%20access',
  });

  assert.equal(result.path, null);
  assert.equal(result.error, 'User denied access');
  assert.equal(calls.getSession, 0);              // bailed before touching the client
  assert.equal(calls.exchangeCodeForSession.length, 0);
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

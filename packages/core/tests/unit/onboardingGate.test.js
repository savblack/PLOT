import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authCallbackRoute,
  cachedProfileSkipsOnboardingGate,
  interpretOnboardingProfile,
  ONBOARDING_GATE_UNDECIDED,
  onboardingGateOnSession,
  onboardingGuardDecision,
  previousOnboardingComplete,
  readOnboardingUntilDecided,
  shouldTrackOnboardingCompleted,
} from '../../onboardingGate.js';

test('the guard waits while the profile has not loaded', () => {
  // The bug: a session with no row yet was treated as a new account and sent
  // to /onboarding. That redirect sticks, because the onboarding route does
  // not run this check.
  assert.equal(onboardingGuardDecision({
    authDecided: true,
    authenticated: true,
    profileDecided: false,
    onboardingComplete: false,
  }), 'loading');
});

test('a session that is still unknown stays on the loader', () => {
  assert.equal(onboardingGuardDecision({
    authDecided: false,
    authenticated: false,
    profileDecided: false,
    onboardingComplete: false,
  }), 'loading');
});

test('a loaded onboarded profile stays in the app', () => {
  assert.equal(onboardingGuardDecision({
    authDecided: true,
    authenticated: true,
    profileDecided: true,
    onboardingComplete: true,
  }), 'app');
});

test('a loaded profile that has not finished setup goes to onboarding', () => {
  assert.equal(onboardingGuardDecision({
    authDecided: true,
    authenticated: true,
    profileDecided: true,
    onboardingComplete: false,
  }), 'onboarding');
});

test('signed out goes to login without waiting on a profile', () => {
  assert.equal(onboardingGuardDecision({
    authDecided: true,
    authenticated: false,
    profileDecided: false,
    onboardingComplete: false,
  }), 'login');
});

test('the onboarding route itself does not bounce', () => {
  assert.equal(onboardingGuardDecision({
    authDecided: true,
    authenticated: true,
    profileDecided: false,
    onboardingComplete: false,
    skipOnboardingCheck: true,
  }), 'app');
});

test('an empty or failed profile read is not a decision', () => {
  assert.deepEqual(
    interpretOnboardingProfile({ data: null, error: null }),
    { decided: false, onboardingComplete: false },
  );
  assert.deepEqual(
    interpretOnboardingProfile({ data: null, error: { message: 'jwt' } }),
    { decided: false, onboardingComplete: false },
  );
  assert.equal(interpretOnboardingProfile(null).decided, false);

  const done = interpretOnboardingProfile({ data: { onboarding_complete: true }, error: null });
  assert.equal(done.decided, true);
  assert.equal(done.onboardingComplete, true);

  const fresh = interpretOnboardingProfile({ data: { onboarding_complete: null }, error: null });
  assert.equal(fresh.decided, true);
  assert.equal(fresh.onboardingComplete, false);

  const unfinished = interpretOnboardingProfile({ data: { onboarding_complete: false }, error: null });
  assert.equal(unfinished.decided, true);
  assert.equal(unfinished.onboardingComplete, false);
});

test('the reader keeps asking until a row arrives', async () => {
  let calls = 0;
  const read = await readOnboardingUntilDecided(async () => {
    calls += 1;
    if (calls < 3) return { data: null, error: null };
    return { data: { onboarding_complete: true, region: 'US' }, error: null };
  }, { sleep: async () => {} });

  assert.equal(calls, 3);
  assert.equal(read.decided, true);
  assert.equal(read.onboardingComplete, true);
  assert.equal(read.data.region, 'US');
});

test('a thrown profile read is inconclusive and retried', async () => {
  let calls = 0;
  const read = await readOnboardingUntilDecided(async () => {
    calls += 1;
    if (calls === 1) throw new Error('network');
    return { data: { onboarding_complete: false }, error: null };
  }, { sleep: async () => {} });

  assert.equal(calls, 2);
  assert.equal(read.decided, true);
  assert.equal(read.onboardingComplete, false);
});

test('the reader stops when the caller goes away', async () => {
  let calls = 0;
  const read = await readOnboardingUntilDecided(async () => {
    calls += 1;
    return { data: null, error: null };
  }, { sleep: async () => {}, shouldStop: () => calls >= 2 });

  assert.equal(read.decided, false);
  assert.equal(calls, 2);
});

test('maxAttempts bounds the wait and does not guess', async () => {
  let calls = 0;
  const read = await readOnboardingUntilDecided(async () => {
    calls += 1;
    return { data: null, error: null };
  }, { sleep: async () => {}, maxAttempts: 2 });

  assert.equal(calls, 2);
  assert.equal(read.decided, false);
  assert.equal(read.onboardingComplete, false);
});

test('only a cached profile that is finished may skip the loader', () => {
  assert.equal(cachedProfileSkipsOnboardingGate({ onboarding_complete: true }), true);
  assert.equal(cachedProfileSkipsOnboardingGate({ onboarding_complete: false }), false);
  assert.equal(cachedProfileSkipsOnboardingGate({ onboarding_complete: null }), false);
  assert.equal(cachedProfileSkipsOnboardingGate({}), false);
  assert.equal(cachedProfileSkipsOnboardingGate(null), false);
  assert.equal(cachedProfileSkipsOnboardingGate(undefined), false);
});

test('auth callback does not send a finished or still-loading account to onboarding', () => {
  assert.equal(authCallbackRoute('/onboarding', { decided: true, onboardingComplete: true }), 'home');
  assert.equal(authCallbackRoute('/onboarding', { decided: false, onboardingComplete: false }), 'home');
  assert.equal(authCallbackRoute('/onboarding', { decided: true, onboardingComplete: false }), 'onboarding');
  assert.equal(authCallbackRoute('/reset-password', { decided: true, onboardingComplete: false }), 'keep');
});

test('onboarding_completed fires only the first time setup is saved', () => {
  assert.equal(shouldTrackOnboardingCompleted(false), true);
  assert.equal(shouldTrackOnboardingCompleted(null), true);
  assert.equal(shouldTrackOnboardingCompleted(true), false);
  assert.equal(shouldTrackOnboardingCompleted(undefined), false);

  assert.equal(previousOnboardingComplete({ data: { onboarding_complete: true }, error: null }), true);
  assert.equal(previousOnboardingComplete({ data: { onboarding_complete: false }, error: null }), false);
  assert.equal(previousOnboardingComplete({ data: { onboarding_complete: null }, error: null }), null);
  assert.equal(previousOnboardingComplete({ data: null, error: null }), null);
  assert.equal(previousOnboardingComplete({ data: null, error: { message: 'nope' } }), undefined);
  assert.equal(
    shouldTrackOnboardingCompleted(previousOnboardingComplete({ data: { onboarding_complete: true }, error: null })),
    false,
  );
});

function decisionFor(memory) {
  return onboardingGuardDecision({
    authDecided: true,
    authenticated: true,
    profileDecided: memory.profileDecided,
    onboardingComplete: memory.onboardingComplete,
  });
}

test('a completion recorded on this device replaces an earlier "not finished"', () => {
  // The loop: an app page was opened partway through setup, so the guard had
  // read "not finished" for this account. After the save it kept that answer,
  // and /onboarding (which reads the row itself) kept sending the account
  // back to the app.
  const readNotFinished = { profileDecided: true, onboardingComplete: false, decidedUserId: 'u1' };
  assert.equal(decisionFor(readNotFinished), 'onboarding');

  const next = onboardingGateOnSession(readNotFinished, { userId: 'u1', cachedComplete: true });

  assert.equal(decisionFor(next.memory), 'app');
  assert.equal(next.memory.decidedUserId, 'u1');
  // Still re-read once; the row stays the authority.
  assert.equal(next.maxAttempts, 1);
});

test('a first session with a recorded completion opens the app while it re-reads', () => {
  const next = onboardingGateOnSession(ONBOARDING_GATE_UNDECIDED, { userId: 'u1', cachedComplete: true });
  assert.equal(decisionFor(next.memory), 'app');
  assert.equal(next.maxAttempts, 1);
});

test('a first session with nothing recorded waits for the row', () => {
  const next = onboardingGateOnSession(ONBOARDING_GATE_UNDECIDED, { userId: 'u1', cachedComplete: false });
  assert.equal(decisionFor(next.memory), 'loading');
  assert.equal(next.maxAttempts, Number.POSITIVE_INFINITY);
});

test('a token refresh keeps the answer the guard already has', () => {
  const finished = { profileDecided: true, onboardingComplete: true, decidedUserId: 'u1' };
  const afterRefresh = onboardingGateOnSession(finished, { userId: 'u1', cachedComplete: false });
  assert.equal(afterRefresh.memory, finished);
  assert.equal(afterRefresh.maxAttempts, 1);

  const notFinished = { profileDecided: true, onboardingComplete: false, decidedUserId: 'u1' };
  const stillSettingUp = onboardingGateOnSession(notFinished, { userId: 'u1', cachedComplete: false });
  assert.equal(stillSettingUp.memory, notFinished);
  assert.equal(stillSettingUp.maxAttempts, 1);
});

test('an answer for one account is not reused for another', () => {
  const finished = { profileDecided: true, onboardingComplete: true, decidedUserId: 'u1' };
  const next = onboardingGateOnSession(finished, { userId: 'u2', cachedComplete: false });
  assert.equal(decisionFor(next.memory), 'loading');
  assert.equal(next.maxAttempts, Number.POSITIVE_INFINITY);
});

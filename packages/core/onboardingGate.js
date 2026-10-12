/**
 * Whether an authenticated account should see onboarding.
 *
 * The profile row is a network read. A signed-in session often exists a turn
 * before that read returns, and a read made in that turn can come back empty:
 * RLS hides the row when the request goes out without the new access token,
 * which is the same shape as "no profile". Treating that empty result as
 * onboarding_complete = false sent finished accounts through setup again,
 * and the completion event then sent another welcome email.
 *
 * Only a returned row decides. Until then the guard shows a loader.
 */

/**
 * @param {{ data?: { onboarding_complete?: boolean | null } | null, error?: unknown } | null | undefined} result
 * @returns {{ decided: boolean, onboardingComplete: boolean }}
 */
export function interpretOnboardingProfile(result) {
  if (!result || result.error || result.data == null) {
    return { decided: false, onboardingComplete: false };
  }
  return {
    decided: true,
    onboardingComplete: result.data.onboarding_complete === true,
  };
}

/**
 * Keep reading until a profile row arrives, or the caller stops.
 *
 * The first attempt is immediate. Later attempts back off so a token that
 * lands a moment after sign-in still resolves to the real row instead of a
 * guess. `maxAttempts` bounds the wait for callers that have somewhere else
 * to hand the decision (the auth callback lets the app guard keep waiting).
 *
 * @template {object} T
 * @param {() => Promise<{ data?: T | null, error?: unknown }>} fetchProfile
 * @param {{
 *   shouldStop?: () => boolean,
 *   sleep?: (ms: number) => Promise<void>,
 *   maxAttempts?: number,
 * }} [opts]
 * @returns {Promise<{ decided: boolean, onboardingComplete: boolean, data: T | null }>}
 */
export async function readOnboardingUntilDecided(fetchProfile, opts = {}) {
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const shouldStop = opts.shouldStop ?? (() => false);
  const maxAttempts = opts.maxAttempts ?? Number.POSITIVE_INFINITY;
  let delay = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (shouldStop()) break;
    if (delay) await sleep(delay);
    if (shouldStop()) break;

    let result;
    try {
      result = await fetchProfile();
    } catch (error) {
      result = { data: null, error };
    }
    if (shouldStop()) break;

    const read = interpretOnboardingProfile(result);
    if (read.decided) {
      return { ...read, data: result?.data ?? null };
    }
    delay = delay === 0 ? 200 : Math.min(delay * 2, 2000);
  }

  return { decided: false, onboardingComplete: false, data: null };
}

/**
 * A cached profile may skip the boot loader only when it positively says
 * setup is finished. A cache that says otherwise used to redirect before the
 * live row arrived, and the onboarding route does not run this gate, so the
 * redirect stuck.
 *
 * @param {{ onboarding_complete?: boolean | null } | null | undefined} profile
 * @returns {boolean}
 */
export function cachedProfileSkipsOnboardingGate(profile) {
  return profile?.onboarding_complete === true;
}

/**
 * @param {{
 *   authDecided: boolean,
 *   authenticated: boolean,
 *   profileDecided: boolean,
 *   onboardingComplete: boolean,
 *   skipOnboardingCheck?: boolean,
 * }} state
 * @returns {'loading' | 'login' | 'onboarding' | 'app'}
 */
export function onboardingGuardDecision(state) {
  // Session unknown (no cache, getSession still in flight) is a loader, not
  // a bounce to /login and not a bounce to /onboarding.
  if (!state.authDecided) return 'loading';
  if (!state.authenticated) return 'login';
  if (state.skipOnboardingCheck) return 'app';
  if (!state.profileDecided) return 'loading';
  return state.onboardingComplete ? 'app' : 'onboarding';
}

/**
 * Where the auth callback should send a confirmed session.
 *
 * resolveAuthCallback's default path is /onboarding, which is right for a new
 * account and wrong for anyone who already finished. An inconclusive profile
 * read is not a new account either: the app guard waits and decides. Falling
 * through to /onboarding (including as the fallback when nothing was stored
 * to return to) is what put finished accounts back in setup.
 *
 * @param {string | null | undefined} callbackPath
 * @param {{ decided?: boolean, onboardingComplete?: boolean } | null | undefined} read
 * @returns {'keep' | 'home' | 'onboarding'}
 */
export function authCallbackRoute(callbackPath, read) {
  if (callbackPath !== '/onboarding') return 'keep';
  if (read?.decided && !read.onboardingComplete) return 'onboarding';
  return 'home';
}

/**
 * Value of onboarding_complete before this save, for the completion event.
 * `undefined` means the read failed. That is not proof this is the first time.
 *
 * @param {{ data?: { onboarding_complete?: boolean | null } | null, error?: unknown } | null | undefined} result
 * @returns {boolean | null | undefined}
 */
export function previousOnboardingComplete(result) {
  if (!result || result.error) return undefined;
  if (result.data == null) return null;
  const value = result.data.onboarding_complete;
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/**
 * The welcome email is keyed off onboarding_completed. A second pass through
 * setup must not emit it. A failed pre-save read must not emit it either.
 *
 * @param {boolean | null | undefined} previous
 * @returns {boolean}
 */
export function shouldTrackOnboardingCompleted(previous) {
  return previous === false || previous === null;
}

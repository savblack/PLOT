/**
 * A channel for telling the root layout that `onboarding_complete` has changed.
 *
 * WHY THIS EXISTS
 * AuthGuard routes off `onboardingComplete`, which the root layout caches from
 * a profile read. That read only runs on the initial session check and on
 * onAuthStateChange — neither of which fires when the seed screen finishes
 * onboarding. So the database said true while React still said false, and the
 * guard bounced every newly onboarded user straight back to /onboarding/name:
 * an infinite loop that no new account could escape.
 *
 * It only affected NEW accounts, which is why it survived until the app's first
 * real signup test. An existing user's profile read returns true on mount, so
 * the guard sends them into the app and stays there.
 *
 * The seed screen awaits this before navigating, so the guard never sees the
 * stale value at all rather than correcting itself a moment later.
 */
import { createContext, useContext } from 'react';

export const OnboardingRefreshContext = createContext<() => Promise<void>>(async () => {});

export function useOnboardingRefresh() {
  return useContext(OnboardingRefreshContext);
}

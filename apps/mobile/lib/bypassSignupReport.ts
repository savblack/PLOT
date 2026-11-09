// Mobile side of the signup-bypass analytics that web runs on /auth/callback.
//
// A bypass signup leaves the account unconfirmed, so user_signed_up cannot
// fire on submit the way a token-backed signup does. It fires when the
// emailed link opens the app and hands it a session. The app's link carries
// no ?from=signup (see APP_AUTH_CALLBACK in signup-bypass), so the stored
// pending flag is what marks the click as a signup. The decision itself is
// @plot/core/authCallbackReport.js, the same one web uses.
import type { User } from '@supabase/supabase-js';
import {
  authReportStorageKeys,
  clearPendingBypassSignup,
  pendingBypassMatches,
  planAuthCallbackReport,
  rememberPendingBypassSignup,
  rememberSignupTracked,
  signupAlreadyTracked,
} from '@plot/core/authCallbackReport.js';
import { readStorage, removeStorage, writeStorage } from './storage';
import { track, EVENTS, type AnalyticsProps } from './analytics';

type SyncStore = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

// The core helpers take synchronous storage. Read their keys up front, then
// write through to AsyncStorage in the background.
async function snapshotStore(userId?: string | null): Promise<SyncStore> {
  const keys = authReportStorageKeys(userId);
  const values = await Promise.all(keys.map((key) => readStorage(key)));
  const cache = new Map<string, string | null>(keys.map((key, i) => [key, values[i]]));
  return {
    get: (key) => cache.get(key) ?? null,
    set: (key, value) => { cache.set(key, value); void writeStorage(key, value); },
    remove: (key) => { cache.delete(key); void removeStorage(key); },
  };
}

/** Called when signup-bypass accepted a new account for this address. */
export async function rememberBypassSignup(email: string) {
  rememberPendingBypassSignup(email, await snapshotStore());
}

/**
 * Called once the emailed link has produced a session in the app. Does
 * nothing unless this device started a bypass signup for the same address,
 * so OAuth and ordinary magic-link sign-ins are reported where they always were.
 */
export async function reportBypassSignupConfirmed(user: User | null | undefined) {
  if (!user?.id) return;
  const store = await snapshotStore(user.id);
  if (!pendingBypassMatches(user.email, store)) return;
  const plan = planAuthCallbackReport({
    user,
    sessionMethod: null,
    pendingBypass: true,
    alreadyTracked: signupAlreadyTracked(user.id, store),
  });
  if (plan.event === 'user_signed_up') track(EVENTS.USER_SIGNED_UP, (plan.props ?? undefined) as AnalyticsProps | undefined);
  if (plan.rememberSignup) rememberSignupTracked(user.id, store);
  clearPendingBypassSignup(store);
}

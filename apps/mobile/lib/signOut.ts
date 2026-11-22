// Sign out, shared by Settings and the drawer's account menu so both ask the
// same question and leave the phone in the same state. RN-only: it removes
// this phone's push token first, which web has no counterpart for.
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { COMMON } from '@plot/core/copy/common.js';
import { PUSH_ALERTS } from '@plot/core/copy/pushAlerts.js';
import type { ConfirmOptions } from '../components/Dialog';
import { supabase } from './supabase';
import { track, resetAnalytics, EVENTS } from './analytics';
import { unregisterPushToken } from './pushNotifications';

/**
 * Asks first, then signs out. Resolves true once the session is gone, false
 * when the viewer cancelled or the push token could not be removed (they
 * stay signed in, and are told why).
 */
export async function signOutOfPlot({ userId, confirm, notify }: {
  userId: string | null | undefined;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (title: string, message?: string) => void;
}): Promise<boolean> {
  if (!(await confirm({ title: SETTINGS_VIEW.page.signOutTitle, message: SETTINGS_VIEW.page.signOutMessage, confirmLabel: SETTINGS_VIEW.signOut, cancelLabel: COMMON.cancel, destructive: true }))) return false;
  if (userId) {
    try { await unregisterPushToken(userId); }
    catch { notify(PUSH_ALERTS.error); return false; }
  }
  // Capture before the reset, or the event lands on the fresh anonymous
  // profile instead of the person who actually signed out.
  track(EVENTS.USER_SIGNED_OUT, {});
  await supabase.auth.signOut();
  resetAnalytics();
  return true;
}

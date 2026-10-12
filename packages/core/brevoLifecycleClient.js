// Browser and app calls for the Brevo lifecycle sync. Best-effort: a Brevo
// outage must not block onboarding, a watch, or an import.
import { getConfig } from './config.js';
import { supabase } from './supabase.js';

function canCall() {
  const cfg = getConfig();
  return !!(cfg.supabaseUrl || cfg.supabaseClient);
}

async function quiet(label, run) {
  if (!canCall()) return { ok: false, skipped: true };
  try {
    const error = await run();
    if (error) console.warn(`[brevo] ${label} failed`, error.message || error);
    return { ok: !error };
  } catch (err) {
    console.warn(`[brevo] ${label} failed`, err);
    return { ok: false };
  }
}

/**
 * After the first time onboarding saves its watchlist picks. Callers gate
 * this with shouldTrackOnboardingCompleted. A second pass through setup
 * must not call it. The RPC flags the account so the hourly job can still
 * send if this call never reaches the function. The function itself sends
 * onboarding_completed, and will not send it again once the claim is taken.
 */
export function notifyOnboardingCompleted() {
  return quiet('onboarding sync', async () => {
    const { error: flagError } = await supabase.rpc('request_brevo_onboarding_event');
    if (flagError) return flagError;
    const { error } = await supabase.functions.invoke('brevo-lifecycle', {
      body: { action: 'onboarding_completed' },
    });
    return error;
  });
}

/** Once a day. The RPC no-ops when this account was already seen today (UTC). */
export function touchLastSeen() {
  return quiet('last seen', async () => {
    const { error } = await supabase.rpc('touch_last_seen');
    return error;
  });
}

/** A finished import. The hourly job copies IMPORTED onto the Brevo contact. */
export function markBrevoImported() {
  return quiet('import flag', async () => {
    const { error } = await supabase.rpc('mark_brevo_imported');
    return error;
  });
}

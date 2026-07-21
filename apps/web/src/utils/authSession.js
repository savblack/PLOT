const SESSION_TIMEOUT_MS = 10_000;

/**
 * Resolve the current session without letting an unavailable auth service leave
 * a route on its loading screen forever. Auth state subscriptions still update
 * the UI if a session becomes available later.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function getSessionOrNull(supabase) {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((resolve) => setTimeout(() => resolve(null), SESSION_TIMEOUT_MS)),
    ]);
    return result?.data?.session ?? null;
  } catch {
    return null;
  }
}

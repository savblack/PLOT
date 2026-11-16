import { getConfig } from './config.js';
import { supabase } from './supabase.js';

/**
 * Call one of the import writers (import_watch_events, import_saved_list,
 * import_saved_annotations).
 *
 * In the apps the caller is the signed-in person and the function reads the
 * account from their session. The import-worker edge function is the service
 * role: it has no session, so those functions refuse it. It sets
 * `importActsForUser`, and the call goes to the `<name>_as` variant, which
 * takes the account explicitly, is granted to the service role only, and runs
 * the same SQL (migration 20261116120000).
 *
 * @param {'import_watch_events' | 'import_saved_list' | 'import_saved_annotations'} name
 * @param {Record<string, unknown>} args
 * @param {string} userId the account the import belongs to
 */
export function importRpc(name, args, userId) {
  if (!getConfig().importActsForUser) return supabase.rpc(name, args);
  return supabase.rpc(`${name}_as`, { p_user: userId, ...args });
}

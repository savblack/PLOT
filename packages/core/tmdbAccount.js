/* A one-time TMDB account import, shared by web and mobile.
 *
 * 1. requestTmdbApproval: the tmdb-account edge function asks TMDB for a
 *    request token and returns the TMDB page where the person approves Plot.
 *    The app keeps the token, then sends the person there.
 * 2. TMDB sends them back to the app's /auth/tmdb (web) or plot://auth/tmdb
 *    (iPhone) with the token. The app checks it is the token it kept: a link
 *    carrying someone else's token would otherwise import that person's TMDB
 *    account into this one.
 * 3. startTmdbAccountImport: the edge function reads the account once and
 *    signs out of it; the app uploads that read as the import file and queues
 *    it (source 'tmdb'). The worker does the rest, as for any export.
 */
import { supabase } from './supabase.js';
import { callAuthenticatedFunction } from './functions.js';
import { startFileImport } from './importJobs.js';
import { IMPORT_ENTRY_POINTS } from './importPipeline.js';
import { TMDB_ACCOUNT_FILE } from './tmdbAccountImport.js';
import { IMPORT_VIEW } from './copy/importView.js';

/** A TMDB request token: 40 hex characters. */
export const isTmdbRequestToken = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

/** @param {string} action @param {Record<string, unknown>} body */
async function callTmdbAccount(action, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(IMPORT_VIEW.tmdbUnavailable);
  const result = await callAuthenticatedFunction('tmdb-account', session, { action, ...body });
  if (!result) throw new Error(IMPORT_VIEW.tmdbUnavailable);
  return result;
}

/**
 * @param {string} redirectTo where TMDB sends the person back to
 * @returns {Promise<{ requestToken: string, approveUrl: string, binding: string }>}
 *   binding ties the token to this Plot account; startTmdbAccountImport needs it.
 */
export async function requestTmdbApproval(redirectTo) {
  let result;
  try { result = await callTmdbAccount('start', { redirect_to: redirectTo }); }
  catch { throw new Error(IMPORT_VIEW.tmdbUnavailable); }
  if (!isTmdbRequestToken(result.requestToken) || typeof result.approveUrl !== 'string'
      || !result.approveUrl.startsWith('https://www.themoviedb.org/authenticate/')
      || typeof result.binding !== 'string' || !/^[0-9a-f]{64}$/.test(result.binding)) {
    throw new Error(IMPORT_VIEW.tmdbUnavailable);
  }
  return { requestToken: result.requestToken, approveUrl: result.approveUrl, binding: result.binding };
}

/**
 * Read the approved account and queue its import.
 * @param {{ userId: string, requestToken: string, binding: string, entry?: string }} args
 * @returns {Promise<{ job: any, error: Error | null, count: number }>}
 */
export async function startTmdbAccountImport({ userId, requestToken, binding, entry = IMPORT_ENTRY_POINTS.IMPORT_PAGE }) {
  if (!userId || !isTmdbRequestToken(requestToken)) return { job: null, error: new Error(IMPORT_VIEW.tmdbNotApproved), count: 0 };
  let account;
  try {
    account = await callTmdbAccount('fetch', { request_token: requestToken, binding });
  } catch (error) {
    const notApproved = error instanceof Error && error.message === 'not_approved';
    return { job: null, error: new Error(notApproved ? IMPORT_VIEW.tmdbNotApproved : IMPORT_VIEW.tmdbUnavailable), count: 0 };
  }
  const count = (account.watchlist?.length || 0) + (account.rated?.length || 0) + (account.ratedEpisodes?.length || 0)
    + (account.lists || []).reduce((sum, list) => sum + (list.items?.length || 0), 0);
  if (!count) return { job: null, error: new Error(IMPORT_VIEW.tmdbEmpty), count: 0 };
  const body = new TextEncoder().encode(JSON.stringify(account));
  const { job, error } = await startFileImport({
    userId, source: 'tmdb', entry, files: [{ name: TMDB_ACCOUNT_FILE, body, contentType: 'application/json' }],
  });
  return { job, error, count };
}

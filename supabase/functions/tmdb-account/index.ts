/**
 * tmdb-account — reads a person's own TMDB account once, for a one-time import.
 *
 * TMDB has no export file, so the app signs the person in to TMDB instead:
 *
 *   start  → a TMDB request token and the TMDB page where the person approves
 *            Plot. TMDB sends them back to `redirect_to` afterwards.
 *   fetch  → swaps the approved token for a TMDB session, reads the watchlist,
 *            ratings and the person's own lists, ends the session, and returns
 *            them. The app uploads that as the import file (source 'tmdb') and
 *            the import-worker runs it like any other export.
 *
 * Nothing is stored here: no token, no session, no account data. The session
 * is deleted in `finally`, so Plot keeps no access to the TMDB account.
 *
 * Plot's TMDB key is a v3 key, so this uses TMDB's v3 user authentication
 * (v4 refuses the key). v3 ratings carry no date. TMDB has no watch history,
 * so there is none to read.
 *
 * Known limit of the v3 flow: a request token is a bearer value. Whoever holds
 * it can read the account once its owner approves it on TMDB's page, which
 * names Plot. That cannot be closed from Plot's side; the exposure is a
 * one-time read of the watchlist, lists and ratings.
 *
 * verify_jwt = true in config.toml; the user is also checked in code.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { reportError } from '../_shared/posthogLog.ts';
import { allowedTmdbRedirect, tmdbTokenBinding, tmdbTokenRefused } from '../_shared/tmdbAccount.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { constantTimeEqual } from '../_shared/serviceBearer.ts';

const TMDB = 'https://api.themoviedb.org/3';
const APPROVE = 'https://www.themoviedb.org/authenticate';
/** At most this many pages (20 titles each) per account list. */
const MAX_PAGES = 250;
/** At most this many of the person's own lists. */
const MAX_LISTS = 100;
/** Pages fetched at once, to stay well under TMDB's rate limit. */
const CONCURRENCY = 4;
/**
 * Stop reading after this long and return what was read, marked truncated.
 * Well inside the platform's wall clock, so the session is always deleted:
 * a function killed mid-read would never reach its `finally`.
 */
const READ_BUDGET_MS = 90_000;
const FORMAT = 'plot-tmdb-account';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function authUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await client.auth.getUser();
  return error || !user ? null : user;
}

class TmdbError extends Error {
  constructor(public status: number, public code: number | null) {
    super(`TMDB ${status}${code != null ? ` (code ${code})` : ''}`);
  }
}

async function tmdb(path: string, { method = 'GET', params = {}, body }: {
  method?: string, params?: Record<string, string>, body?: unknown,
} = {}) {
  const key = Deno.env.get('TMDB_API_KEY');
  if (!key) throw new Error('TMDB_API_KEY not configured');
  const url = new URL(`${TMDB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', key);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('Retry-After')) || 1;
      await new Promise(r => setTimeout(r, Math.min(wait, 5) * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) throw new TmdbError(res.status, Number.isInteger(data?.status_code) ? data.status_code : null);
    return data;
  }
}

const year = (date: unknown) => (typeof date === 'string' && /^\d{4}/.test(date) ? date.slice(0, 4) : null);
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && (id as number) > 0;
const validRating = (r: unknown): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0 && r <= 10;

// deno-lint-ignore no-explicit-any
function title(item: any, mediaType: 'movie' | 'tv') {
  return {
    id: item.id,
    media_type: mediaType,
    title: String((mediaType === 'movie' ? item.title : item.name) || item.title || item.name || ''),
    year: year(mediaType === 'movie' ? item.release_date : item.first_air_date),
  };
}

/** What one read has left: a deadline, and the endpoints it could not finish. */
type Read = { deadline: number, truncated: string[] };

/** Every page of one paged account endpoint, up to MAX_PAGES and the read's deadline. */
// deno-lint-ignore no-explicit-any
async function allPages(path: string, params: Record<string, string>, read: Read): Promise<any[]> {
  if (Date.now() > read.deadline) { read.truncated.push(path); return []; }
  const first = await tmdb(path, { params: { ...params, page: '1' } });
  const total = Math.max(1, Number(first.total_pages) || 1);
  const last = Math.min(total, MAX_PAGES);
  if (total > MAX_PAGES) read.truncated.push(path);
  const results = [...(first.results || first.items || [])];
  for (let page = 2; page <= last; page += CONCURRENCY) {
    if (Date.now() > read.deadline) { if (!read.truncated.includes(path)) read.truncated.push(path); break; }
    const batch = [];
    for (let p = page; p < page + CONCURRENCY && p <= last; p++) {
      batch.push(tmdb(path, { params: { ...params, page: String(p) } }));
    }
    for (const data of await Promise.all(batch)) results.push(...(data.results || data.items || []));
  }
  return results;
}

async function handleStart(body: Record<string, unknown>, userId: string) {
  const redirectTo = String(body.redirect_to || '');
  if (!allowedTmdbRedirect(redirectTo)) return json({ error: 'Invalid redirect' }, 400);
  const token = await tmdb('/authentication/token/new');
  const requestToken = String(token.request_token || '');
  if (!/^[a-f0-9]{40}$/.test(requestToken)) throw new Error('TMDB returned no request token');
  const approveUrl = `${APPROVE}/${requestToken}?redirect_to=${encodeURIComponent(redirectTo)}`;
  // The app sends this back with the token; see tmdbTokenBinding.
  const binding = await tmdbTokenBinding(serviceKey(), userId, requestToken);
  return json({ requestToken, approveUrl, binding });
}

async function handleFetch(body: Record<string, unknown>, userId: string) {
  const startedAt = Date.now();
  const requestToken = String(body.request_token || '');
  if (!/^[a-f0-9]{40}$/.test(requestToken)) return json({ error: 'Invalid request token' }, 400);
  // Only the Plot account that started this sign-in may use its token.
  const expected = await tmdbTokenBinding(serviceKey(), userId, requestToken);
  if (!constantTimeEqual(String(body.binding || ''), expected)) return json({ error: 'not_approved' }, 409);

  let sessionId = '';
  try {
    const session = await tmdb('/authentication/session/new', { method: 'POST', body: { request_token: requestToken } });
    sessionId = String(session.session_id || '');
  } catch (error) {
    // Not approved, expired or already used: the person has to start again.
    // Anything else (rate limit, a bad key, an outage) is "unavailable".
    if (error instanceof TmdbError && tmdbTokenRefused(error.code)) return json({ error: 'not_approved' }, 409);
    throw error;
  }
  if (!sessionId) return json({ error: 'not_approved' }, 409);

  try {
    const account = await tmdb('/account', { params: { session_id: sessionId } });
    if (!validId(account.id)) throw new Error('TMDB returned no account');
    const base = `/account/${account.id}`;
    const params = { session_id: sessionId, sort_by: 'created_at.asc' };
    const read: Read = { deadline: startedAt + READ_BUDGET_MS, truncated: [] };

    const [watchMovies, watchTv, ratedMovies, ratedTv, ratedEpisodes, ownLists] = await Promise.all([
      allPages(`${base}/watchlist/movies`, params, read),
      allPages(`${base}/watchlist/tv`, params, read),
      allPages(`${base}/rated/movies`, params, read),
      allPages(`${base}/rated/tv`, params, read),
      allPages(`${base}/rated/tv/episodes`, params, read),
      allPages(`${base}/lists`, { session_id: sessionId }, read),
    ]);

    const lists = [];
    for (const list of ownLists.slice(0, MAX_LISTS)) {
      if (list?.id == null || !String(list.name || '').trim()) continue;
      if (Date.now() > read.deadline) { read.truncated.push(`/list/${list.id}`); continue; }
      const items = await allPages(`/list/${encodeURIComponent(String(list.id))}`, { session_id: sessionId }, read);
      lists.push({
        id: String(list.id),
        name: String(list.name).trim(),
        items: items
          .filter(item => validId(item?.id) && ['movie', 'tv'].includes(item?.media_type))
          .map(item => title(item, item.media_type)),
      });
    }
    if (ownLists.length > MAX_LISTS) read.truncated.push(`${base}/lists`);

    return json({
      format: FORMAT,
      version: 1,
      account: { id: account.id },
      watchlist: [
        ...watchMovies.filter(item => validId(item?.id)).map(item => title(item, 'movie')),
        ...watchTv.filter(item => validId(item?.id)).map(item => title(item, 'tv')),
      ],
      rated: [
        ...ratedMovies.filter(item => validId(item?.id) && validRating(item.rating)).map(item => ({ ...title(item, 'movie'), rating: item.rating })),
        ...ratedTv.filter(item => validId(item?.id) && validRating(item.rating)).map(item => ({ ...title(item, 'tv'), rating: item.rating })),
      ],
      ratedEpisodes: ratedEpisodes
        .filter(item => validId(item?.show_id) && Number.isInteger(item.season_number) && item.season_number >= 0
          && Number.isInteger(item.episode_number) && item.episode_number >= 1 && validRating(item.rating))
        .map(item => ({
          show_id: item.show_id, season_number: item.season_number, episode_number: item.episode_number,
          name: String(item.name || ''), rating: item.rating,
        })),
      lists,
      truncated: read.truncated.map(path => path.replace(/^\/account\/\d+/, '/account')),
    });
  } finally {
    // Plot keeps no access to the account, whether or not the read finished.
    await tmdb('/authentication/session', { method: 'DELETE', body: { session_id: sessionId } }).catch(() => {});
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const user = await authUser(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === 'start') return await handleStart(body, user.id);
    if (body.action === 'fetch') return await handleFetch(body, user.id);
    return json({ error: 'Unknown action' }, 404);
  } catch (error) {
    reportError('tmdb-account', '[tmdb-account]', error);
    // The apps show their own wording for this (packages/core/copy/importView.js).
    return json({ error: 'tmdb_unavailable' }, 502);
  }
});

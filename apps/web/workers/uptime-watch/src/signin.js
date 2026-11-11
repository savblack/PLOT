/**
 * Signed-in check: sign in as a dedicated test account, read its own rows,
 * write one `history` row the way the app does, and delete it again. Runs
 * against Staging (password sign-in) and production (a stored session that
 * is renewed each run, because production sign-in requires a captcha).
 *
 * WHY: the July 2026 outage broke every write to `history` for two weeks
 * (2026-07-25 to 2026-08-03) while every page still loaded. The other uptime
 * checks are anonymous reads, so they would have stayed green. Only a real
 * signed-in write runs the triggers that failed.
 *
 * It talks to Supabase over plain HTTP (GoTrue for auth, PostgREST for rows)
 * with the publishable key, so it exercises the same policies, grants and
 * triggers as the web client. The write mirrors packages/core/userMedia.js:
 * an upsert on the client's conflict target (HISTORY_CONFLICT_TARGET).
 *
 * The title it writes comes from the TMDB proxy's trending list at run time,
 * never a hardcoded TMDB id (AGENTS.md). If no title can be had, the run is
 * reported as `blocked` (the watcher could not look), not as a Plot outage.
 *
 * Every row it writes carries MARKER in `note`, and each run first deletes
 * any marker row an earlier, interrupted run left behind, so the account
 * never fills up.
 */

export const MARKER = 'plot-signin-watch';
// Keep in step with HISTORY_CONFLICT_TARGET in packages/core/userMedia.js.
// A Worker can't import core (it is deployed on its own), and a test pins it.
export const CONFLICT_TARGET = 'user_id,tmdb_id,media_type';

/**
 * `url` without trailing slashes. A loop rather than /\/+$/, whose
 * backtracking CodeQL flags as slow on long runs of '/'.
 */
export function trimSlashes(url) {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}
const base = trimSlashes;

async function body(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** "HTTP 400 (42P10: there is no unique ... )", with what the server said. */
export function failure(step, status, json) {
  const code = json?.code || json?.error_code || '';
  const msg = json?.message || json?.msg || json?.error_description || (typeof json === 'string' ? json.slice(0, 160) : '');
  const detail = [code, msg].filter(Boolean).join(': ');
  return { ok: false, reason: `${step} failed: HTTP ${status}${detail ? ` (${detail})` : ''}` };
}

/** The first trending movie (else show) that the account has not logged. */
export function pickTitle(trending, taken) {
  const items = Array.isArray(trending?.results) ? trending.results : [];
  const usable = items.filter((r) => Number.isInteger(r?.id) && (r.media_type === 'movie' || r.media_type === 'tv') && !taken.has(`${r.media_type}:${r.id}`));
  const pick = usable.find((r) => r.media_type === 'movie') || usable[0];
  if (!pick) return null;
  return { tmdb_id: pick.id, media_type: pick.media_type, title: pick.title || pick.name || 'Untitled', poster_path: pick.poster_path ?? null };
}

/**
 * Staging: sign in with email and password, as the app's sign-in form does.
 * Production can't do this: its password sign-in requires a Turnstile captcha.
 */
async function passwordSession(t, http) {
  const res = await http(`${t.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: t.apikey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: t.email, password: t.password }),
  });
  const session = await body(res);
  if (!res.ok || !session?.access_token || !session?.user?.id) return failure('sign-in', res.status, session);
  return { session };
}

/** GoTrue's answers that mean "this refresh token is spent", not "auth is down". */
const SPENT = new Set(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'invalid_grant']);

/**
 * Production: renew a stored session. A refresh needs no captcha. GoTrue
 * rotates the token on every use, so the new one is saved before anything
 * else happens; the old one is dead from here on.
 *
 * The chain is seeded, and re-seeded if it ever breaks, by
 * scripts/signin-watch-seed.mjs. A spent or missing token is `blocked` (the
 * watcher lost its key), not `broken`: Plot is not down because of it.
 */
async function refreshSession(t, http) {
  const refresh = await t.store.get(t.storeKey);
  if (!refresh) return { ok: false, blocked: true, reason: 'no stored session: run scripts/signin-watch-seed.mjs' };
  const res = await http(`${t.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: t.apikey, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  const session = await body(res);
  if (!res.ok || !session?.access_token || !session?.refresh_token || !session?.user?.id) {
    const code = session?.error_code || session?.code;
    if ((res.status === 400 || res.status === 401) && SPENT.has(code)) {
      return { ok: false, blocked: true, reason: `stored session no longer valid (${code}): run scripts/signin-watch-seed.mjs` };
    }
    return failure('session refresh', res.status, session);
  }
  try {
    await t.store.put(t.storeKey, session.refresh_token);
  } catch (err) {
    return { ok: false, blocked: true, reason: `could not save the renewed session (${err?.message || err}): run scripts/signin-watch-seed.mjs` };
  }
  return { session, keep: true };
}

/**
 * Run the whole sequence once against one Supabase project. Returns
 * { ok, reason } like every other check, with `blocked: true` when the
 * watcher could not look (no trending title, no usable session).
 *
 * @param {{ url: string, apikey: string, email: string, password?: string,
 *           store?: { get(k: string): Promise<string|null>, put(k: string, v: string): Promise<void> },
 *           storeKey?: string }} target  password for Staging; store + storeKey for production
 * @param {{ http: typeof fetch, trending: () => Promise<any>, now?: () => Date }} deps
 */
export async function readWrite(target, { http, trending, now = () => new Date() }) {
  const t = { ...target, url: base(target.url) };
  const signedIn = t.store ? await refreshSession(t, http) : await passwordSession(t, http);
  if (!signedIn.session) return signedIn;
  const { session, keep } = signedIn;

  const uid = session.user.id;
  const apikey = t.apikey;
  const headers = { apikey, Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' };
  const rest = (path, init = {}) => http(`${t.url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });

  // Never write as anyone but the watcher's own account. A token stored by
  // mistake (or a mix-up in the seed) must not touch a real person's History.
  if (String(session.user.email || '').toLowerCase() !== String(t.email || '').toLowerCase()) {
    if (!keep) await http(`${t.url}/auth/v1/logout?scope=local`, { method: 'POST', headers }).catch(() => {});
    return { ok: false, blocked: true, reason: 'signed in as an unexpected account; refusing to write' };
  }

  try {
    // 2. Read. The account's own profile row must come back: an empty answer
    //    here means row-level security stopped letting people see themselves.
    const profileRes = await rest(`profiles?select=id&id=eq.${uid}`);
    const profile = await body(profileRes);
    if (!profileRes.ok) return failure('read (profile)', profileRes.status, profile);
    if (!Array.isArray(profile) || profile.length !== 1) return { ok: false, reason: 'read (profile) failed: own profile row not returned' };

    const historyRes = await rest(`history?select=id,tmdb_id,media_type,note&user_id=eq.${uid}&order=id.desc&limit=200`);
    const history = await body(historyRes);
    if (!historyRes.ok || !Array.isArray(history)) return failure('read (history)', historyRes.status, history);

    // Leftovers from a run that died between its write and its delete.
    const stale = history.filter((r) => r.note === MARKER).map((r) => r.id);
    if (stale.length) {
      const res = await rest(`history?id=in.(${stale.join(',')})`, { method: 'DELETE' });
      if (!res.ok) return failure('delete (leftover)', res.status, await body(res));
    }
    const taken = new Set(history.filter((r) => r.note !== MARKER).map((r) => `${r.media_type}:${r.tmdb_id}`));

    let title;
    try {
      title = pickTitle(await trending(), taken);
    } catch (err) {
      return { ok: false, blocked: true, reason: `no title to write: trending unavailable (${err?.message || err})` };
    }
    if (!title) return { ok: false, blocked: true, reason: 'no title to write: trending came back empty' };

    // 3. Write, exactly as markWatched does: upsert on the client's conflict
    //    target. This is the statement that raised 42P10 in July.
    const writeRes = await rest(`history?on_conflict=${CONFLICT_TARGET}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_id: uid, ...title, watched_at: now().toISOString(), note: MARKER }),
    });
    const written = await body(writeRes);
    if (!writeRes.ok) return failure('write', writeRes.status, written);
    const id = Array.isArray(written) ? written[0]?.id : undefined;
    if (id === undefined) return { ok: false, reason: 'write failed: no row came back' };

    // 4. Delete it again, and make sure one row actually went.
    const delRes = await rest(`history?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    const deleted = await body(delRes);
    if (!delRes.ok) return failure('delete', delRes.status, deleted);
    if (!Array.isArray(deleted) || deleted.length !== 1) return { ok: false, reason: 'delete failed: the row was not removed' };

    return { ok: true, reason: `signed in, read, wrote and deleted "${title.title}"` };
  } finally {
    // A password session is ended so runs do not pile up refresh tokens. A
    // refreshed one is kept: signing it out would revoke the stored token.
    if (!keep) {
      try { await http(`${t.url}/auth/v1/logout?scope=local`, { method: 'POST', headers }); } catch { /* ignore */ }
    }
  }
}

/** Staging, from the Worker's SIGNIN_* vars and secrets. */
export function signedInReadWrite(env, deps) {
  return readWrite({ url: env.SIGNIN_SUPABASE_URL, apikey: env.SIGNIN_PUBLISHABLE_KEY, email: env.SIGNIN_EMAIL, password: env.SIGNIN_PASSWORD }, deps);
}

export const PROD_SESSION_KEY = 'signin-prod-session';

/** Production, from SIGNIN_PROD_* and the session stored in the STATE namespace. */
export function productionReadWrite(env, deps) {
  return readWrite({
    url: env.SIGNIN_PROD_SUPABASE_URL,
    apikey: env.SIGNIN_PROD_PUBLISHABLE_KEY,
    email: env.SIGNIN_PROD_EMAIL,
    store: { get: (k) => env.STATE.get(k), put: (k, v) => env.STATE.put(k, v) },
    storeKey: PROD_SESSION_KEY,
  }, deps);
}

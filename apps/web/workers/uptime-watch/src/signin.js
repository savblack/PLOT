/**
 * Signed-in check: sign in as a dedicated test account, read its own rows,
 * write one `history` row the way the app does, and delete it again.
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

const base = (url) => url.replace(/\/+$/, '');

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
 * Run the whole sequence once. Returns { ok, reason } like every other check,
 * with `blocked: true` only when the trending list was unavailable.
 *
 * @param {object} env  SIGNIN_SUPABASE_URL, SIGNIN_PUBLISHABLE_KEY, SIGNIN_EMAIL, SIGNIN_PASSWORD
 * @param {{ http: typeof fetch, trending: () => Promise<any>, now?: () => Date }} deps
 */
export async function signedInReadWrite(env, { http, trending, now = () => new Date() }) {
  const url = base(env.SIGNIN_SUPABASE_URL);
  const apikey = env.SIGNIN_PUBLISHABLE_KEY;

  // 1. Sign in with email and password, as the app's sign-in form does.
  const auth = await http(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.SIGNIN_EMAIL, password: env.SIGNIN_PASSWORD }),
  });
  const session = await body(auth);
  if (!auth.ok || !session?.access_token || !session?.user?.id) return failure('sign-in', auth.status, session);

  const uid = session.user.id;
  const headers = { apikey, Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' };
  const rest = (path, init = {}) => http(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });

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
    // End the session so runs do not pile up refresh tokens. Best effort.
    try { await http(`${url}/auth/v1/logout?scope=local`, { method: 'POST', headers }); } catch { /* ignore */ }
  }
}

// Resolve an auth redirect (OAuth, magic link, email confirmation, recovery)
// into a single navigation decision — WITHOUT ever sending someone into the app
// before their session is confirmed.
//
// Why this exists: Google/OAuth sign-ins come back to /auth/callback with the
// session in the URL *hash* (`#access_token=…`), which Supabase parses into
// storage asynchronously (detectSessionInUrl). The old callback navigated to
// /onboarding immediately, which stripped the hash before Supabase could read
// it — so getSession() came up empty, ProtectedRoute bounced to /login, and the
// user looped there (real signups from Spain & Ethiopia died exactly this way,
// Jul 2026). The fix is to *await* session resolution here, while the hash is
// still in the URL, and never navigate onward without a session.
//
// Kept as a pure, injectable function (no React, no window) so the guarantee is
// unit-testable in Node — see tests/unit/authCallback.test.js.

function parseHash(hash) {
  const out = {};
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return out;
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

// Wait for the next SIGNED_IN (or any session) from onAuthStateChange, up to
// `waitMs`. Backstop for the rare case where detectSessionInUrl resolves a beat
// after our first getSession() — we'd rather wait briefly than strand the user.
function waitForSession(supabase, waitMs, { setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let sub = null;
    const finish = (session) => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(timer);
      try { sub?.unsubscribe?.(); } catch { /* ignore */ }
      resolve(session);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });
    sub = data?.subscription;
    const timer = setTimeoutFn(() => finish(null), waitMs);
  });
}

/**
 * @param {object} supabase  Supabase client (auth.exchangeCodeForSession,
 *   verifyOtp, getSession, onAuthStateChange).
 * @param {{ search?: string, hash?: string }} location  window.location parts.
 * @param {object} [opts]  { waitMs, setTimeoutFn, clearTimeoutFn } — injectable for tests.
 * @returns {Promise<{ path: string|null, session: object|null, error: string|null }>}
 *   `path` is where to navigate (replace). `path === null` with `error` set means
 *   show the error screen — never a silent hop into the app.
 */
export async function resolveAuthCallback(supabase, location = {}, opts = {}) {
  const search = new URLSearchParams(location.search || '');
  const hashParams = parseHash(location.hash);
  const waitMs = opts.waitMs ?? 4000;

  // Provider-side error (query or hash) — surface it, never proceed.
  const errDesc = search.get('error_description') || hashParams.error_description;
  if (errDesc) return { path: null, session: null, error: errDesc };

  const code = search.get('code');
  const tokenHash = search.get('token_hash');
  const type = search.get('type') || hashParams.type || null;

  // 1. PKCE / OAuth code exchange — deterministic and awaited.
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { path: null, session: null, error: error.message };
    return { path: type === 'recovery' ? '/reset-password' : '/onboarding', session: data?.session ?? null, error: null };
  }

  // 2. Email OTP link carrying token_hash in the query — verifyOtp (awaited).
  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return { path: null, session: null, error: error.message };
    return { path: type === 'recovery' ? '/reset-password' : '/onboarding', session: data?.session ?? null, error: null };
  }

  // 3. Implicit hash (#access_token=…) or an already-established session.
  //    Awaiting getSession() forces detectSessionInUrl to parse the hash NOW,
  //    while it's still in the URL — this is the actual bounce-loop fix.
  let session = (await supabase.auth.getSession())?.data?.session ?? null;

  // 4. Backstop: give a late SIGNED_IN a short window before giving up.
  if (!session) session = await waitForSession(supabase, waitMs, opts);

  // Never navigate onward without a session — that's the regression we're killing.
  if (!session) return { path: null, session: null, error: 'no-session' };

  return { path: type === 'recovery' ? '/reset-password' : '/onboarding', session, error: null };
}

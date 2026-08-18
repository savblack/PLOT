import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { track, identifyUser, EVENTS } from '../lib/analytics.js';
import { resolveAuthCallback, credentialKind } from '../utils/authCallback.js';
import { authErrorReason } from '@plot/core/authErrors.js';
import PlotLogo from '../components/PlotLogo.jsx';
import { AUTH_PAGE } from '../copy/authPage.js';
import { AUTH_CALLBACK_PAGE } from '../copy/authCallbackPage.js';

// Report a sign-in that died here. Unlike reportAuth this fires even with no
// method marker: an expired confirmation link opened in a fresh tab has none, and
// that failure is every bit as worth seeing. `reason` goes through
// authErrorReason so an unrecognised message collapses to 'unknown' instead of
// leaking provider text (error_description is arbitrary third-party wording).
function reportAuthFailure(message, method, credential) {
  track(EVENTS.AUTH_CALLBACK_FAILED, {
    reason: authErrorReason(message),
    method: method || 'none',
    credential,
  });
}

// Replace the current history entry with a bare /auth/callback (no query, no
// hash) once the credential in it has been consumed. replaceState rather than
// pushState so the back button stays clean.
//
// MUST run only after resolveAuthCallback has resolved the session — clearing
// the URL first is exactly the regression utils/authCallback.js documents,
// where the hash was stripped before Supabase could read it and real signups
// looped back to /login.
function clearAuthParamsFromUrl() {
  try {
    if (window.location.search || window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  } catch { /* non-fatal: navigation below still moves off the credential URL */ }
}

// Read the method marker AuthPage stashed before it redirected, exactly once.
// Both reporters below need it, and it must not outlive this callback: a marker
// left sitting in sessionStorage would misattribute the next sign-in on this tab.
function consumeAuthMethod() {
  try {
    const method = sessionStorage.getItem('plot_auth_method');
    sessionStorage.removeItem('plot_auth_method');
    return method;
  } catch { return null; }
}

// Report a social / magic-link auth exactly once. Email+password already fires
// its event at form submit, so we only report when AuthPage stashed a method
// marker before redirecting (OAuth / magic link). New-vs-returning is inferred
// from how recently the account was created.
function reportAuth(session, method) {
  const user = session?.user;
  if (!method || !user) return;
  identifyUser(user.id, { email: user.email });
  const createdMs = user.created_at ? Date.parse(user.created_at) : 0;
  const isNew = createdMs > 0 && (Date.now() - createdMs) < 60_000;
  track(isNew ? EVENTS.USER_SIGNED_UP : EVENTS.USER_LOGGED_IN, { method });
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  // Run exactly once: the code/hash in the URL is single-use, and React
  // StrictMode double-invokes effects in dev.
  const ranRef = useRef(false);

  useEffect(() => {
    // Run exactly once. ranRef (not an effect-cleanup flag) is the guard: under
    // StrictMode the effect is invoked twice, but the ref persists across the
    // remount, so the second invocation is a no-op and the first still delivers
    // its result. A cleanup-based `cancelled` flag would instead suppress it.
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      // Both captured before anything can consume or scrub them: the method
      // marker is single-use, and clearAuthParamsFromUrl strips the credential
      // out of the URL further down.
      const method = consumeAuthMethod();
      const credential = credentialKind(window.location.search, window.location.hash);
      try {
        // Read straight from window.location — resolveAuthCallback needs the hash
        // (#access_token=…) too, which useSearchParams doesn't expose.
        const { path, session, error: err } = await resolveAuthCallback(supabase, {
          search: window.location.search,
          hash: window.location.hash,
        });
        // The credential has now been consumed out of the URL, so scrub it from
        // the address bar. Matters most on the error branch just below, which
        // renders in place and never navigates away — leaving the token sitting
        // in the URL and in browser history.
        clearAuthParamsFromUrl();
        if (err) { reportAuthFailure(err, method, credential); setError(err); return; }
        reportAuth(session, method);
        // resolveAuthCallback guarantees a confirmed session before returning a
        // path, so we never land the user in the app logged-out.
        navigate(path || '/onboarding', { replace: true });
      } catch (e) {
        // Anything unexpected (client init, network) surfaces the error screen
        // rather than hanging on the loader forever.
        const message = e?.message || 'no-session';
        reportAuthFailure(message, method, credential);
        setError(message);
      }
    })();
  }, [navigate]);

  if (error) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-sans)',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <PlotLogo style={{ fontSize: '2rem' }} />
        <p style={{ color: '#c0392b', fontSize: '0.95rem' }}>
          {error === 'no-session'
            ? AUTH_CALLBACK_PAGE.couldNotFinishSignIn
            : AUTH_CALLBACK_PAGE.linkExpiredOrInvalid}
        </p>
        <a href="/login" style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '0.9rem' }}>{AUTH_PAGE.backToSignIn}</a>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <PlotLogo style={{ fontSize: '2rem' }} />
    </div>
  );
}

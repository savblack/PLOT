import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { track, identifyUser, EVENTS } from '../lib/analytics.js';
import { resolveAuthCallback } from '../utils/authCallback.js';
import PlotLogo from '../components/PlotLogo.jsx';

// Report a social / magic-link auth exactly once. Email+password already fires
// its event at form submit, so we only report when AuthPage stashed a method
// marker before redirecting (OAuth / magic link). New-vs-returning is inferred
// from how recently the account was created.
function reportAuth(session) {
  let method = null;
  try {
    method = sessionStorage.getItem('plot_auth_method');
    sessionStorage.removeItem('plot_auth_method');
  } catch { /* ignore */ }
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
      try {
        // Read straight from window.location — resolveAuthCallback needs the hash
        // (#access_token=…) too, which useSearchParams doesn't expose.
        const { path, session, error: err } = await resolveAuthCallback(supabase, {
          search: window.location.search,
          hash: window.location.hash,
        });
        if (err) { setError(err); return; }
        reportAuth(session);
        // resolveAuthCallback guarantees a confirmed session before returning a
        // path, so we never land the user in the app logged-out.
        navigate(path || '/onboarding', { replace: true });
      } catch (e) {
        // Anything unexpected (client init, network) surfaces the error screen
        // rather than hanging on the loader forever.
        setError(e?.message || 'no-session');
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
            ? "We couldn't finish signing you in. Please try again."
            : 'This link has expired or is invalid.'}
        </p>
        <a href="/login" style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '0.9rem' }}>Back to sign in</a>
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

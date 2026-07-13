import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { track, identifyUser, EVENTS } from '../lib/analytics.js';
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
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handle = async () => {
      const token_hash = searchParams.get('token_hash');
      const type       = searchParams.get('type');
      const code       = searchParams.get('code');

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(error.message); return; }
        reportAuth(data?.session);
        navigate('/onboarding', { replace: true });
        return;
      }

      if (token_hash && type) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) { setError(error.message); return; }
        if (type === 'recovery') { navigate('/reset-password', { replace: true }); return; }
        reportAuth(data?.session);
      }

      // Signup confirmation or generic redirect — onboarding checks completion itself
      navigate('/onboarding', { replace: true });
    };

    handle();
  }, [navigate, searchParams]);

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
        <p style={{ color: '#c0392b', fontSize: '0.95rem' }}>This link has expired or is invalid.</p>
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

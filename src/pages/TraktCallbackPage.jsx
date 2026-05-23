import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../api/supabase';

const TRAKT_SYNC_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trakt-sync`
  : null;

export default function TraktCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const called = useRef(false); // prevent StrictMode double-invoke

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const handle = async () => {
      const code = searchParams.get('code');
      if (!code) {
        setError('No authorization code received from Trakt.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }

      const redirectUri = `${window.location.origin}/auth/trakt`;
      const res = await fetch(TRAKT_SYNC_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'exchange', code, redirect_uri: redirectUri }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        setError(`Could not connect Trakt: ${text}`);
        return;
      }

      navigate('/settings', { replace: true });
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
        fontFamily: "'Manrope', system-ui, sans-serif",
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '2rem', letterSpacing: '-0.04em' }}>PLOT</span>
        <p style={{ color: '#c0392b', fontSize: '0.95rem', maxWidth: 360 }}>{error}</p>
        <a href="/settings" style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '0.9rem' }}>Back to settings</a>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Manrope', system-ui, sans-serif",
      gap: '0.75rem',
    }}>
      <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '2rem', letterSpacing: '-0.04em' }}>PLOT</span>
      <p style={{ fontSize: '0.9rem', color: '#666', margin: 0 }}>Connecting Trakt…</p>
    </div>
  );
}

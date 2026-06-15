import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { callAuthenticatedFunction, edgeFunctionUrl } from '../api/functions.js';
import { SHOW_MEDIA_INTEGRATIONS } from '../constants/launchFeatures.js';
import { getTraktCallbackUrl } from '../utils/redirects.js';

export default function TraktCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const called = useRef(false); // prevent StrictMode double-invoke

  useEffect(() => {
    if (!SHOW_MEDIA_INTEGRATIONS) return;
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
      if (!edgeFunctionUrl('trakt-sync')) {
        setError('Trakt sync is not configured.');
        return;
      }

      try {
        await callAuthenticatedFunction('trakt-sync', session, {
          action: 'exchange',
          code,
          redirect_uri: getTraktCallbackUrl(),
        });
      } catch (e) {
        setError(`Could not connect Trakt: ${e.message}`);
        return;
      }

      navigate('/settings', { replace: true });
    };

    handle();
  }, [navigate, searchParams]);

  if (!SHOW_MEDIA_INTEGRATIONS) {
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
        <p style={{ color: '#666', fontSize: '0.95rem', maxWidth: 420, margin: 0 }}>
          Trakt sync is being held for after the public launch and is not available in the live app right now.
        </p>
        <a href="/settings" style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '0.9rem' }}>Back to settings</a>
      </div>
    );
  }

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

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { callAuthenticatedFunction, edgeFunctionUrl } from '@plot/core/functions.js';
import { consumeTraktState, getTraktCallbackUrl } from '../utils/redirects.js';
import PlotLogo from '../components/PlotLogo.jsx';
import { TRAKT_CALLBACK_PAGE } from '../copy/traktCallbackPage.js';
import { track, EVENTS } from '../lib/analytics.js';

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
      const state = searchParams.get('state');
      if (!code) {
        setError(TRAKT_CALLBACK_PAGE.noAuthCode);
        return;
      }
      if (!consumeTraktState(state)) {
        setError(TRAKT_CALLBACK_PAGE.invalidOrExpired);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }
      if (!edgeFunctionUrl('trakt-sync')) {
        setError(TRAKT_CALLBACK_PAGE.notConfigured);
        return;
      }

      try {
        await callAuthenticatedFunction('trakt-sync', session, {
          action: 'exchange',
          code,
          redirect_uri: getTraktCallbackUrl(),
        });
      } catch (e) {
        setError(TRAKT_CALLBACK_PAGE.couldNotConnect(e.message));
        return;
      }

      // The exchange succeeded, so the integration genuinely exists now.
      track(EVENTS.TRAKT_CONNECTED, {});
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
        fontFamily: 'var(--font-sans)',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <PlotLogo style={{ fontSize: '2rem' }} />
        <p style={{ color: '#c0392b', fontSize: '0.95rem', maxWidth: 360 }}>{error}</p>
        <a href="/settings" style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '0.9rem' }}>{TRAKT_CALLBACK_PAGE.backToSettings}</a>
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
      fontFamily: 'var(--font-sans)',
      gap: '0.75rem',
    }}>
      <PlotLogo style={{ fontSize: '2rem' }} />
      <p style={{ fontSize: '0.9rem', color: '#666', margin: 0 }}>{TRAKT_CALLBACK_PAGE.connecting}</p>
    </div>
  );
}

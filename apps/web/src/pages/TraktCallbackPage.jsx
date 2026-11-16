import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { callAuthenticatedFunction, edgeFunctionUrl } from '@plot/core/functions.js';
import { consumeTraktReturnTo, consumeTraktState, getTraktCallbackUrl, traktErrorReturn, TRAKT_POPUP_FAILED_MESSAGE, TRAKT_POPUP_MESSAGE } from '../utils/redirects.js';
import PlotLogo from '../components/PlotLogo.jsx';
import { CONNECT_BACK_LABELS, TRAKT_CALLBACK_PAGE } from '../copy/traktCallbackPage.js';
import { track, EVENTS } from '../lib/analytics.js';

// One style for the link and the popup's button, so they look the same.
const BACK_STYLE = { color: '#1a1a1a', fontWeight: 600, fontSize: '0.9rem' };

export default function TraktCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setErrorMessage] = useState(null);
  // Where the error page's link goes: back to the page the connect started on.
  const [back, setBack] = useState(() => traktErrorReturn(null));
  // Setup connects in a popup. The page behind it is still open, so the
  // popup offers to close itself, not to open a second copy of setup.
  const [inPopup, setInPopup] = useState(false);
  const called = useRef(false); // prevent StrictMode double-invoke

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const setError = (message) => {
      setBack(traktErrorReturn(consumeTraktReturnTo()));
      const popup = Boolean(window.opener && !window.opener.closed);
      setInPopup(popup);
      // Tell the page that opened this popup, which is otherwise left waiting.
      if (popup) {
        try { window.opener.postMessage({ type: TRAKT_POPUP_FAILED_MESSAGE }, window.location.origin); } catch { /* cross-origin opener: nothing to tell */ }
      }
      setErrorMessage(message);
    };

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
      const returnTo = consumeTraktReturnTo();
      // Opened as a popup by onboarding: tell that page and get out of the
      // way, so its picks survive the connect.
      if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage({ type: TRAKT_POPUP_MESSAGE }, window.location.origin); } catch { /* cross-origin opener: fall through */ }
        window.close();
      }
      navigate(returnTo, { replace: true });
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
        {inPopup
          ? <button type="button" onClick={() => window.close()} style={{ ...BACK_STYLE, background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>{TRAKT_CALLBACK_PAGE.closeWindow}</button>
          : <a href={back.href} style={BACK_STYLE}>{CONNECT_BACK_LABELS[back.place]}</a>}
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

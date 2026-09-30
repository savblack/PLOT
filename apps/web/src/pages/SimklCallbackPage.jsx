import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { track, EVENTS } from '../lib/analytics.js';
import { consumeSimklReturnTo, consumeSimklState, getSimklCallbackUrl } from '../utils/redirects.js';
import PlotLogo from '../components/PlotLogo.jsx';

export default function SimklCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    const run = async () => {
      const code = params.get('code');
      if (!code || !consumeSimklState(params.get('state'))) {
        setError('This Simkl authorization link is missing or expired.'); return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return navigate('/login', { replace: true });
      try {
        await callAuthenticatedFunction('simkl-sync', session, {
          action: 'exchange', code, redirect_uri: getSimklCallbackUrl(),
        });
        track(EVENTS.SIMKL_CONNECTED, {});
        navigate(consumeSimklReturnTo(), { replace: true });
      } catch (e) { setError(`Could not connect Simkl. ${e.message}`); }
    };
    run();
  }, [navigate, params]);

  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
    <div><PlotLogo style={{ fontSize: '2rem' }} /><p>{error || 'Connecting Simkl…'}</p>{error && <a href="/import?source=simkl">Back to import</a>}</div>
  </div>;
}

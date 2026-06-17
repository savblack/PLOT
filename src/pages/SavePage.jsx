import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../api/supabase.js';
import { writePendingSave } from '../utils/pendingSave.js';
import PlotLoader from '../components/PlotLoader.jsx';

/**
 * /save?media_type=movie&tmdb_id=12345
 *
 * Entry point for "Save to watchlist" links that live OUTSIDE the app (the
 * weekly newsletter, the public chart page). This page never adds the title
 * itself — it records the intent and routes the user into the authenticated
 * app, where the pending-save processor (see usePendingSave) reuses the normal
 * watchlist add path. That keeps a single, real code path for adding titles and
 * makes the flow idempotent and auth-aware for free.
 */
export default function SavePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const intent = writePendingSave({
      tmdb_id: params.get('tmdb_id'),
      media_type: params.get('media_type'),
      source: params.get('src'),
    });

    // Malformed link — nothing to save, just drop the user into the app.
    if (!intent) {
      navigate('/home', { replace: true });
      return;
    }

    // Authenticated users go straight to the app shell, where the processor
    // completes the save and opens the title. Logged-out users go to login;
    // the intent persists in localStorage across login/signup (same browser).
    supabase.auth.getSession().then(({ data: { session } }) => {
      navigate(session ? '/home' : '/login', { replace: true });
    });
  }, [params, navigate]);

  return (
    <div className="app-boot-loader">
      <PlotLoader />
    </div>
  );
}

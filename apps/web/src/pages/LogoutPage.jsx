import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { track, resetAnalytics, EVENTS } from '../lib/analytics.js';
import { _resetHistoryCache } from '@plot/core/useHistory.js';
import { clearCachedSession } from '../utils/sessionCache.js';
import './AuthPage.css';
import { loadSupabase } from '../utils/loadSupabase.js';
import PlotLogo from '../components/PlotLogo.jsx';
import AuthShelf from '../components/AuthShelf.jsx';

// The marketing site doubles as the logged-out home.
const MARKETING_URL = 'https://theplot.tv';

/**
 * Dedicated sign-out page. Visiting it ends the session (so it's safe to link
 * directly or land on after a redirect), then confirms the user is signed out
 * and offers a clear path back in.
 */
export default function LogoutPage() {
  const [working, setWorking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // This route replaces the app shell, so its auth listener may already be
      // unmounted. Clear the cached profile, including calendar_token, before
      // any network operation or redirect can fail.
      clearCachedSession();
      _resetHistoryCache();
      // Capture before the reset, or the event lands on the fresh anonymous
      // profile instead of the person who actually signed out.
      track(EVENTS.USER_SIGNED_OUT, {});
      const supabase = await loadSupabase();
      const { error } = await supabase.auth.signOut();
      // A global revoke can fail offline — clear the local session at least so
      // the device is signed out regardless.
      if (error) await supabase.auth.signOut({ scope: 'local' });
      // Drop the identity so the next person on this browser isn't attributed
      // to the one who just left.
      resetAnalytics();
      if (!cancelled) setWorking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="auth-page auth-page--logout">

      {/* ── Left: new this week ── */}
      <AuthShelf />

      {/* ── Right: confirmation panel ── */}
      <div className="auth-panel">
        <Link to="/login" className="auth-panel-logo" aria-label="plot">
          <PlotLogo inherit aria-hidden="true" />
        </Link>

        <div className="auth-panel-body">
          {working ? (
            <div className="auth-success" aria-live="polite">
              <PlotLoader />
              <p>Signing you out…</p>
            </div>
          ) : (
            <div className="auth-success" aria-live="polite">
              <h1>You're signed out</h1>
              <p>Come back any time. Your watchlist and history will be right where you left them.</p>
              <div className="logout-actions">
                <Link to="/login" className="auth-cta auth-cta--primary">Log back in</Link>
                <a href={MARKETING_URL} className="auth-cta auth-cta--secondary">Return to homepage</a>
              </div>
            </div>
          )}
        </div>

        <p className="auth-panel-footer">
          By continuing you agree to our <Link to="/terms">Terms</Link>, <Link to="/community">Community Standards</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

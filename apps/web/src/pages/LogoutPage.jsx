import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { HERO_POSTERS } from '../constants/heroPosters.js';
import PlotLoader from '../components/PlotLoader.jsx';
import './AuthPage.css';

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
      const { error } = await supabase.auth.signOut();
      // A global revoke can fail offline — clear the local session at least so
      // the device is signed out regardless.
      if (error) await supabase.auth.signOut({ scope: 'local' });
      if (!cancelled) setWorking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const scrollPosters = [...HERO_POSTERS, ...HERO_POSTERS];

  return (
    <div className="auth-page">

      {/* ── Left: living poster wall ── */}
      <div className="auth-visual" aria-hidden="true">
        <div className="poster-track">
          {scrollPosters.map((src, i) => (
            <div key={i} className="poster-cell" style={{ backgroundImage: `url('${src}')` }} />
          ))}
        </div>
        <div className="auth-visual-gradient" />
        <div className="auth-visual-brand">
          <span className="auth-visual-logo">PLOT</span>
          <span className="auth-visual-tagline">Your film &amp; TV companion</span>
        </div>
      </div>

      {/* ── Right: confirmation panel ── */}
      <div className="auth-panel">
        <Link to="/login" className="auth-panel-logo" aria-label="PLOT">
          PLOT
        </Link>

        <div className="auth-panel-body">
          {working ? (
            <div className="auth-success" aria-live="polite">
              <PlotLoader />
              <p>Signing you out…</p>
            </div>
          ) : (
            <div className="auth-success" aria-live="polite">
              <div className="auth-success-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
              </div>
              <h1>You're signed out</h1>
              <p>Come back any time — your watchlist and history will be right where you left them.</p>
              <div className="logout-actions">
                <Link to="/login" className="auth-cta">Log back in</Link>
                <a href={MARKETING_URL} className="auth-cta auth-cta--outline">Return to homepage</a>
              </div>
            </div>
          )}
        </div>

        <p className="auth-panel-footer">
          By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

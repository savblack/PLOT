import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../api/supabase.js';
import { tmdb } from '../api/tmdb.js';
import { writePendingSave } from '../utils/pendingSave.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';

/**
 * /save?media_type=movie&tmdb_id=12345
 *
 * Entry point for "Save to watchlist" links that live OUTSIDE the app (the
 * weekly newsletter, the public chart page, a shared title). This page never
 * adds the title itself — it records the intent (localStorage, survives the
 * signup round-trip) and hands off to the authenticated app, where the
 * pending-save processor (usePendingSave) reuses the normal watchlist add path.
 *
 * Two audiences:
 *  - Logged-in  → straight into the app shell; the processor completes the save.
 *  - Logged-out → an editorial PREVIEW of the title with a "Save to your PLOT"
 *    CTA, instead of an immediate bounce to /login. The recipient sees what
 *    they'd be saving (the value) before being asked to sign up — the intent is
 *    already stashed, so signing up (or in) completes the save automatically.
 */
const posterUrl = (path) => (path ? `https://image.tmdb.org/t/p/w342${path}` : null);
const yearOf = (t) => (t?.release_date || t?.first_air_date || '').slice(0, 4);

// Movies show runtime ("2h 35m"); series show season count ("3 seasons") —
// whichever the TMDB record carries.
function durationLabel(t) {
  if (t?.runtime) {
    const h = Math.floor(t.runtime / 60);
    const m = t.runtime % 60;
    return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
  }
  if (t?.number_of_seasons) {
    const s = t.number_of_seasons;
    return `${s} season${s === 1 ? '' : 's'}`;
  }
  return null;
}

export default function SavePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const handled = useRef(false);
  // 'checking' → deciding; 'preview' → logged-out preview shown.
  const [phase, setPhase] = useState('checking');
  const [title, setTitle] = useState(null);
  const src = params.get('src') || 'save';

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const intent = writePendingSave({
      tmdb_id: params.get('tmdb_id'),
      media_type: params.get('media_type'),
      source: src,
    });

    // Malformed link — nothing to save, just drop the user into the app.
    if (!intent) {
      navigate('/home', { replace: true });
      return;
    }

    // The handled ref (not a cleanup flag) guards against React StrictMode's
    // double-invoke, so we must NOT cancel this async work on unmount — the
    // second mount is guarded out, and cancelling would strand the loader.
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Authenticated users go straight to the app shell, where the processor
      // completes the save and opens the title.
      if (session) {
        navigate('/home', { replace: true });
        return;
      }
      // Logged-out: show a preview instead of walling at /login. Resolve the
      // title at runtime from the id in the link (never hardcoded). A failed
      // lookup (bad id / rate limit) still shows the generic save preview — the
      // wall is what we're removing, so we never bounce here.
      tmdb.getDetails(intent.media_type, intent.tmdb_id)
        .then(({ ok, data }) => setTitle(ok ? data : null))
        .catch(() => {})
        .finally(() => setPhase('preview'));
    });
  }, [params, navigate, src]);

  if (phase !== 'preview') {
    return (
      <div className="app-boot-loader">
        <PlotLoader />
      </div>
    );
  }

  const name = title?.title || title?.name || null;
  const year = yearOf(title);
  const poster = posterUrl(title?.poster_path);
  const overview = title?.overview
    ? (title.overview.length > 200 ? `${title.overview.slice(0, 197)}…` : title.overview)
    : null;

  const rating = title?.vote_average > 0 ? title.vote_average.toFixed(1) : null;
  const genreStr = (title?.genres || []).slice(0, 2).map((g) => g.name).join(' · ');
  const durationStr = durationLabel(title);
  const metaTail = [genreStr || null, durationStr].filter(Boolean).join(' · ');

  return (
    <div className="save-preview">
      <style>{styles}</style>
      <Link to="/" className="save-brand" aria-label="PLOT">PLOT</Link>

      <div className="save-inner">
        {poster
          ? <img className="save-poster" src={poster} alt={name ? `${name} poster` : ''} />
          : <div className="save-poster save-poster--empty" aria-hidden="true" />}

        <p className="save-kicker">Save to your PLOT</p>
        <h1 className="save-title">
          {name || 'This title'}
          {year && <span className="save-year"> ({year})</span>}
        </h1>

        {(rating || metaTail) && (
          <p className="save-meta">
            {rating && <><span className="save-star">★</span> {rating}{metaTail ? ' · ' : ''}</>}
            {metaTail}
          </p>
        )}

        {overview && <p className="save-overview">{overview}</p>}

        <div className="save-actions">
          <Link to={`/signup?src=${encodeURIComponent(src)}`} className="btn btn-primary">
            Create free account to save
          </Link>
          <Link to="/login" className="btn btn-ghost">Sign in</Link>
        </div>

        <p className="save-rule">Your personal watchlist across every streaming service.</p>
      </div>
    </div>
  );
}

const styles = `
  .save-preview {
    min-height: 100dvh;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding: clamp(2rem, 6vh, 3.5rem) 1.25rem 3rem;
    background: var(--bg);
  }
  .save-brand {
    font-family: var(--font-serif); font-size: 1.5rem; font-weight: 400;
    letter-spacing: -0.05em; color: var(--text-primary);
    margin-bottom: clamp(1.5rem, 4vh, 2.4rem); text-decoration: none;
  }
  .save-inner { width: 100%; max-width: 440px; }
  .save-poster {
    width: 156px; aspect-ratio: 2/3; object-fit: cover; display: block;
    margin: 0 auto 1.35rem; border-radius: 8px;
    border: 1px solid var(--border); background: var(--surface-raised);
  }
  .save-kicker {
    font-size: 0.68rem; letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--text-secondary); margin: 0;
  }
  .save-title {
    font-family: var(--font-serif); font-weight: 400;
    font-size: clamp(2.1rem, 6vw, 3rem); line-height: 1.02; letter-spacing: -0.02em;
    margin: 0.35rem 0 0.65rem; color: var(--text-primary); text-wrap: balance;
  }
  .save-year { opacity: 0.5; }
  .save-meta {
    font-size: 0.82rem; color: var(--text-secondary); letter-spacing: 0.01em;
    margin: 0 0 1.15rem;
  }
  .save-meta .save-star { color: var(--text-primary); }
  .save-overview {
    max-width: 44ch; margin: 0 auto 1.5rem;
    font-size: 0.95rem; line-height: 1.6; color: var(--text-secondary);
  }
  .save-actions { display: flex; gap: 0.7rem; align-items: center; justify-content: center; flex-wrap: wrap; }
  .save-rule {
    margin: clamp(1.6rem, 4vh, 2.2rem) auto 0; max-width: 320px;
    border-top: 1px solid var(--border); padding-top: 0.9rem;
    font-size: 0.75rem; color: var(--text-secondary);
  }
`;

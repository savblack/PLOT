// Web rendering of the "New this week" shelf beside the sign-in, sign-up and
// sign-out forms. Which titles to show is decided in @plot/core/newThisWeek.js
// so mobile can share it; mobile's auth screen has its own poster wall layout.
//
// Speed rules (issue 1596: the old 21-image wall made /signup the slowest
// page in the app): one TMDB request, six small posters, nothing fetched on
// phones where the panel is hidden, and fixed-size tiles so nothing shifts
// when the posters arrive.
import { useEffect, useState } from 'react';
import { loadNewThisWeek, NEW_THIS_WEEK_COUNT } from '@plot/core/newThisWeek.js';
import { AUTH_PAGE } from '../copy/authPage.js';
import { MEDIA } from '../copy/media.js';
import { posterUrl } from '../utils/images.js';
import PlotLogo from './PlotLogo.jsx';
import { TABLET_QUERY } from '../hooks/useWide.js';

// The tablet breakpoint, where AuthPage.css shows .auth-visual.
const SHELF_VISIBLE_QUERY = TABLET_QUERY;

const EMPTY_TILES = Array.from({ length: NEW_THIS_WEEK_COUNT }, (_, i) => ({ key: `empty-${i}` }));

export default function AuthShelf() {
  const [titles, setTitles] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia(SHELF_VISIBLE_QUERY);
    let cancelled = false;
    let started = false;
    const start = () => {
      if (started || !query.matches) return;
      started = true;
      loadNewThisWeek().then((picked) => { if (!cancelled) setTitles(picked); });
    };
    start();
    // A phone turned to landscape, or a window widened past the breakpoint.
    query.addEventListener?.('change', start);
    return () => {
      cancelled = true;
      query.removeEventListener?.('change', start);
    };
  }, []);

  const tiles = titles?.length
    ? titles.map(t => ({ ...t, key: `${t.mediaType}:${t.id}` }))
    : EMPTY_TILES;

  return (
    <aside className="auth-visual" aria-labelledby="auth-shelf-label">
      <p id="auth-shelf-label" className="auth-shelf-label">{AUTH_PAGE.newThisWeek}</p>
      <ul className="auth-shelf">
        {tiles.map(tile => (
          <li key={tile.key} className="auth-shelf-item">
            <div className="auth-shelf-poster">
              {tile.posterPath && (
                <img
                  src={posterUrl(tile.posterPath, 'w185')}
                  srcSet={`${posterUrl(tile.posterPath, 'w185')} 185w, ${posterUrl(tile.posterPath, 'w342')} 342w`}
                  sizes="(min-width: 1600px) 220px, 12vw"
                  alt=""
                  decoding="async"
                  fetchPriority="low"
                />
              )}
            </div>
            <div className="auth-shelf-caption">
              {tile.title && (
                <>
                  <span className="auth-shelf-title">{tile.title}</span>
                  <span className="auth-shelf-kind">{tile.mediaType === 'tv' ? MEDIA.series : MEDIA.movie}</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="auth-visual-brand">
        <span className="auth-visual-logo"><PlotLogo inherit /></span>
        <span className="auth-visual-tagline">Your movie &amp; TV companion</span>
      </div>
    </aside>
  );
}

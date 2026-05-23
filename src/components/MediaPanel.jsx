import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp, backdropUrl, logoUrl, countdownChip, formatDate } from '../App.jsx';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';
import { useHistory } from '../hooks/useHistory.js';

/* ── Close icon ── */
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

/* ── Format a local time string from an ISO airstamp ── */
function fmtAirstamp(airstamp, timezone) {
  if (!airstamp) return '';
  const d = new Date(airstamp);
  if (isNaN(d)) return '';
  const opts = { hour: 'numeric', minute: '2-digit', hour12: true };
  if (timezone) opts.timeZone = timezone;
  return d.toLocaleTimeString('en', opts).toLowerCase();
}

/* ── Check icon (circle with tick) ── */
function CheckCircleIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" strokeWidth="1.5"/>
      <polyline points="9 12 11 14 15 10" stroke="white" strokeWidth="2" fill="none"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
    </svg>
  );
}

/* ── Season selector + episode list ── */
function EpisodeGuide({ tvId, currentProgress, details, timezone }) {
  const { watching } = useApp();
  const seasons     = (details?.seasons || []).filter(s => s.season_number > 0);
  const [selSeason, setSelSeason] = useState(currentProgress?.current_season || 1);
  const [episodes,  setEpisodes]  = useState([]);
  const [epLoading, setEpLoading] = useState(false);
  const [epError,   setEpError]   = useState(false);
  const [checkingEp, setCheckingEp] = useState(null); // ep number being toggled

  // Track whether user manually changed season (to suppress auto-follow)
  const userChangedSeason = useRef(false);

  // TVMaze air times keyed by "season-episode"
  const [tvmazeTimes, setTvmazeTimes] = useState({});

  // Auto-follow to new season when progress advances (e.g. after checking last ep)
  useEffect(() => {
    if (!userChangedSeason.current && currentProgress?.current_season) {
      setSelSeason(currentProgress.current_season);
    }
  }, [currentProgress?.current_season]);

  useEffect(() => {
    setEpLoading(true);
    setEpError(false);
    tmdb.getSeason(tvId, selSeason).then(data => {
      if (data?.episodes?.length) {
        setEpisodes(data.episodes);
      } else {
        setEpisodes([]);
        setEpError(!data);
      }
      setEpLoading(false);
    });
  }, [tvId, selSeason]);

  // Fetch episode air times from TVMaze (has airstamp even for streaming shows)
  useEffect(() => {
    const name = details?.name;
    if (!name) return;
    let cancelled = false;
    (async () => {
      try {
        const searchRes = await fetch(
          `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(name)}`
        );
        if (!searchRes.ok || cancelled) return;
        const show = await searchRes.json();
        if (!show?.id || cancelled) return;

        const epRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/episodes`);
        if (!epRes.ok || cancelled) return;
        const eps = await epRes.json();
        if (!Array.isArray(eps) || cancelled) return;

        const map = {};
        for (const ep of eps) {
          const stamp = ep.airstamp || (ep.airtime ? null : null);
          if (stamp) map[`${ep.season}-${ep.number}`] = stamp;
        }
        setTvmazeTimes(map);
      } catch { /* silent — times are best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [details?.name]);

  /* ── Determine per-episode watched state ── */
  const currentSeason = currentProgress?.current_season || 0;
  const currentEp     = currentProgress?.current_episode || 0;

  const isEpWatched = (ep) => {
    if (selSeason < currentSeason) return true;
    if (selSeason > currentSeason) return false;
    return ep.episode_number < currentEp;
  };

  const isCurrentEp = (ep) =>
    selSeason === currentSeason && ep.episode_number === currentEp;

  /* ── Toggle an episode's watched state ── */
  const handleCheckEp = useCallback(async (ep, watched) => {
    if (!currentProgress || checkingEp !== null) return;
    setCheckingEp(ep.episode_number);

    if (!watched) {
      // Mark watched: advance progress past this episode
      if (ep.episode_number < episodes.length) {
        await watching.setProgress(tvId, selSeason, ep.episode_number + 1);
      } else {
        // Last episode of season → advance to next season
        const nextSeason = selSeason + 1;
        await watching.setProgress(tvId, nextSeason, 1);
        userChangedSeason.current = false; // allow auto-follow to next season
      }
    } else {
      // Unmark: pull progress back to this episode
      await watching.setProgress(tvId, selSeason, ep.episode_number);
    }

    setCheckingEp(null);
  }, [currentProgress, checkingEp, watching, tvId, selSeason, episodes.length]);

  const isTracking = !!currentProgress;

  return (
    <div>
      {seasons.length > 1 && (
        <div className="season-select">
          {seasons.map(s => (
            <button
              key={s.season_number}
              className={`season-chip${selSeason === s.season_number ? ' active' : ''}`}
              onClick={() => {
                userChangedSeason.current = true;
                setSelSeason(s.season_number);
              }}
            >
              S{s.season_number}
            </button>
          ))}
        </div>
      )}

      {epLoading ? (
        <div className="loading-state" style={{ minHeight: 80 }}><div className="spinner" /></div>
      ) : episodes.length === 0 ? (
        <div style={{ padding: '1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {epError ? 'Could not load episodes. Try again later.' : 'No episodes available yet.'}
        </div>
      ) : (
        <div className="episode-list">
          {episodes.map(ep => {
            const watched    = isEpWatched(ep);
            const isCurrent  = isCurrentEp(ep);
            const chip       = ep.air_date ? countdownChip(ep.air_date) : null;
            const isUpcoming = chip && chip.cls !== 'chip-muted';
            const airstamp   = isUpcoming ? tvmazeTimes[`${selSeason}-${ep.episode_number}`] : null;
            const airTime    = airstamp ? fmtAirstamp(airstamp, timezone) : null;
            const isChecking = checkingEp === ep.episode_number;

            return (
              <div
                key={ep.episode_number}
                className={`ep-row${watched ? ' watched' : ''}${isCurrent ? ' ep-current' : ''}`}
              >
                <span className="ep-num">E{String(ep.episode_number).padStart(2,'0')}</span>
                <div className="ep-info">
                  <div className="ep-title">{ep.name || `Episode ${ep.episode_number}`}</div>
                  {ep.air_date && (
                    <div className="ep-air">
                      {formatDate(ep.air_date)}
                      {isUpcoming && airTime && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.3rem' }}>· {airTime}</span>
                      )}
                      {isUpcoming && (
                        <span className={`chip ${chip.cls}`} style={{ marginLeft: '0.4rem', fontSize: '0.58rem' }}>
                          {chip.label}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Check button — only shown when tracking progress */}
                {isTracking && (
                  isChecking ? (
                    <span className="ep-spinner" />
                  ) : (
                    <button
                      className={`ep-check-btn${watched ? ' checked' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleCheckEp(ep, watched); }}
                      aria-label={watched ? 'Mark unwatched' : 'Mark watched'}
                      title={watched ? 'Unmark as watched' : 'Mark as watched'}
                    >
                      <CheckCircleIcon filled={watched} />
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   MediaPanel
═══════════════════════════════════════ */
export default function MediaPanel({ itemId, itemType, closing, onClose }) {
  const { watchlist, watching, user, profile } = useApp();
  const timezone = profile?.timezone || null;
  const history = useHistory(user?.id);

  const [details,      setDetails]      = useState(null);
  const [providers,    setProviders]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [detailsError, setDetailsError] = useState(false);

  const isMovie    = itemType === 'movie';
  const inList     = watchlist.isInList(itemId);
  const isWatching = !isMovie && watching.isWatching(itemId);
  const progress   = watching.getProgress(itemId);
  const watched    = history.isWatched(itemId);

  const loadDetails = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setDetailsError(false);
    const [det, prov] = await Promise.all([
      isMovie ? tmdb.getMovieDetails(itemId) : tmdb.getTVDetails(itemId),
      tmdb.getWatchProviders(itemId, itemType),
    ]);
    if (!det) {
      setDetailsError(true);
    } else {
      setDetails(det);
      const region = getTmdbRegion();
      setProviders(prov?.results?.[region]?.flatrate || []);
    }
    setLoading(false);
  }, [itemId, itemType, isMovie]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDetails(); }, [loadDetails]);

  const title   = details?.title || details?.name || '';
  const year    = (details?.release_date || details?.first_air_date || '').slice(0, 4);
  const rating  = details?.vote_average ? `${details.vote_average.toFixed(1)} ★` : '';
  const genres  = (details?.genres || []).slice(0, 3).map(g => g.name).join(' · ');
  const date    = details?.release_date || details?.first_air_date;
  const chip    = date ? countdownChip(date) : null;

  return (
    <>
      <div className={`panel-overlay${closing ? ' closing' : ''}`} onClick={onClose} />
      <div className={`panel${closing ? ' closing' : ''}`}>
        {/* Header image */}
        <div className="panel-header-wrap">
          {details?.backdrop_path
            ? <img className="panel-header-img" src={backdropUrl(details.backdrop_path)} alt="" />
            : <div className="panel-header-fallback" />
          }
          <button className="panel-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div className="loading-state" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : detailsError ? (
          <div className="panel-body" style={{ textAlign: 'center', paddingTop: '2rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Couldn't load details. Check your connection and try again.
            </div>
            <button className="btn btn-ghost btn-sm" onClick={loadDetails}>Retry</button>
          </div>
        ) : (
          <div className="panel-body">
            {/* Title */}
            <h2 className="panel-title">{title}</h2>

            {/* Meta row */}
            <div className="panel-meta-row">
              {year && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{year}</span>}
              {isMovie ? (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Movie</span>
              ) : (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Series{details?.number_of_seasons ? ` · ${details.number_of_seasons} season${details.number_of_seasons > 1 ? 's' : ''}` : ''}
                </span>
              )}
              {rating && <span style={{ fontSize: '0.8rem', color: '#F59E0B', fontWeight: 700 }}>{rating}</span>}
              {chip && chip.cls !== 'chip-muted' && (
                <span className={`chip ${chip.cls}`}>{chip.label}</span>
              )}
            </div>

            {genres && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{genres}</div>
            )}

            {/* Overview */}
            {details?.overview && (
              <p className="panel-overview">{details.overview}</p>
            )}

            {/* Actions */}
            <div className="panel-actions">
              {/* Save for later — hidden while actively watching (already in list) */}
              {!isWatching && (
                <button
                  className={`btn ${inList ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                  onClick={() => watchlist.toggle({ ...details, id: itemId, media_type: itemType })}
                >
                  {inList ? 'SAVED' : 'SAVE'}
                </button>
              )}

              {/* TV: Start Watching (also removes from Saved list) */}
              {!isMovie && !isWatching && (
                <button
                  className="btn btn-accent btn-sm"
                  onClick={async () => {
                    await watching.startWatching({ ...details, id: itemId, media_type: 'tv' });
                    // Move from Saved → Watching
                    if (inList) await watchlist.removeFromList(itemId);
                  }}
                >
                  ▶ Start Watching
                </button>
              )}

              {/* TV: Currently watching badge + progress */}
              {!isMovie && isWatching && (
                <span className="chip chip-episode" style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}>
                  ▶ Watching · S{String(progress?.current_season).padStart(2,'0')}E{String(progress?.current_episode).padStart(2,'0')}
                </span>
              )}

              {!watched ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => history.logWatched({ ...details, id: itemId, media_type: itemType })}
                >
                  Mark watched
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => history.removeEntry(itemId)}
                  title="Mark as unwatched"
                >
                  Watched ✓
                </button>
              )}
            </div>

            {/* Where to watch */}
            {providers.length > 0 && (
              <>
                <div className="panel-section-title">Where to Watch</div>
                <div className="providers-grid">
                  {providers.map(p => (
                    <div key={p.provider_id} className="provider-chip">
                      {p.logo_path && (
                        <img src={logoUrl(p.logo_path, 'w45')} alt={p.provider_name} />
                      )}
                      {p.provider_name}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Episode guide for TV */}
            {!isMovie && details && (
              <>
                <div className="panel-section-title">Episodes</div>
                <EpisodeGuide tvId={itemId} currentProgress={progress} details={details} timezone={timezone} />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

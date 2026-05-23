import { useEffect, useState } from 'react';
import { useApp, backdropUrl, TodayLabel } from '../App.jsx';
import { localDateStr } from '../utils/date.js';

/* ── Icons ── */
function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" fill="var(--accent)" stroke="var(--accent)" />
      <polyline points="7 12 10.5 15.5 17 9" stroke="#fff" strokeWidth="2.5" />
    </svg>
  );
}
function EmptyCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
function ChevronIcon({ dir }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      {dir === 'left'
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />
      }
    </svg>
  );
}

/* ── Watching Card ─────────────────────────────────────────────── */
function WatchingCard({ progress, watching, onOpen, onStop }) {
  const [viewSeason,  setViewSeason]  = useState(progress.current_season);
  const [seasonData,  setSeasonData]  = useState(null);
  const [loadingEp,   setLoadingEp]   = useState(null); // episode_number currently toggling

  /* ── Re-fetch season whenever viewSeason changes ── */
  useEffect(() => {
    setSeasonData(null);
    watching.fetchSeason(progress.tmdb_id, viewSeason).then(setSeasonData);
  }, [progress.tmdb_id, viewSeason]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Keep viewSeason in sync if progress jumps to a new season ── */
  useEffect(() => {
    setViewSeason(progress.current_season);
  }, [progress.current_season]);

  const today    = localDateStr(); // local date, not UTC, so AU users get the right "today"
  const episodes = seasonData?.episodes || [];

  /* Aired = has an air_date on or before today */
  const isAired   = (ep) => Boolean(ep.air_date) && ep.air_date <= today;

  /* Watched = depends on which season we're viewing vs where progress is */
  const isWatched = (ep) => {
    if (viewSeason < progress.current_season) return true;
    if (viewSeason > progress.current_season) return false;
    return ep.episode_number < progress.current_episode;
  };

  const airedEps      = episodes.filter(isAired);
  const watchedCount  = viewSeason < progress.current_season
    ? airedEps.length
    : viewSeason > progress.current_season
      ? 0
      : Math.min(Math.max(0, progress.current_episode - 1), airedEps.length);

  const pct            = airedEps.length > 0 ? (watchedCount / airedEps.length) * 100 : 0;
  const seasonComplete = viewSeason === progress.current_season
    && airedEps.length > 0
    && progress.current_episode > airedEps[airedEps.length - 1]?.episode_number;

  /* ── Toggle a single episode ── */
  const handleToggle = async (ep) => {
    if (loadingEp !== null || !isAired(ep)) return;
    setLoadingEp(ep.episode_number);
    if (isWatched(ep)) {
      // Unmark: rewind progress to this episode
      await watching.setProgress(progress.tmdb_id, viewSeason, ep.episode_number);
    } else {
      // Mark watched: advance past this episode
      await watching.setProgress(progress.tmdb_id, viewSeason, ep.episode_number + 1);
    }
    setLoadingEp(null);
  };

  /* ── Advance to next season ── */
  const startNextSeason = async () => {
    setLoadingEp('season');
    await watching.setProgress(progress.tmdb_id, viewSeason + 1, 1);
    setViewSeason(v => v + 1);
    setLoadingEp(null);
  };

  return (
    <div className="watching-card">

      {/* Backdrop */}
      <div className="watching-backdrop-wrap" onClick={() => onOpen(progress.tmdb_id, 'tv')}>
        {seasonData?.backdrop_path
          ? <img src={backdropUrl(seasonData.backdrop_path)} alt="" />
          : progress.poster_path
            ? <img src={backdropUrl(progress.poster_path, 'w780')} alt="" style={{ objectPosition: 'center top' }} />
            : <div style={{ width: '100%', height: '100%', background: 'var(--surface-raised)' }} />
        }
        <div className="watching-backdrop-gradient" />
        <div className="watching-backdrop-title">{progress.title}</div>
      </div>

      <div className="watching-body">

        {/* Season nav + watched count */}
        <div className="watching-season-nav">
          <button
            className="season-nav-btn"
            onClick={() => setViewSeason(v => v - 1)}
            disabled={viewSeason <= 1}
            aria-label="Previous season"
          >
            <ChevronIcon dir="left" />
          </button>
          <span className="season-nav-label">Season {viewSeason}</span>
          <button
            className="season-nav-btn"
            onClick={() => setViewSeason(v => v + 1)}
            aria-label="Next season"
          >
            <ChevronIcon dir="right" />
          </button>
          {airedEps.length > 0 && (
            <span className="season-watched-count">{watchedCount}/{airedEps.length} watched</span>
          )}
        </div>

        {/* Progress bar */}
        {airedEps.length > 0 && (
          <div className="progress-row" style={{ marginBottom: '0.6rem' }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Season complete prompt */}
        {seasonComplete && (
          <div className="watching-season-complete">
            <span>Season {viewSeason} done</span>
            <button
              className="btn btn-accent btn-xs"
              onClick={startNextSeason}
              disabled={loadingEp === 'season'}
            >
              {loadingEp === 'season' ? '…' : `Start Season ${viewSeason + 1}`}
            </button>
          </div>
        )}

        {/* Episode list */}
        {seasonData === null ? (
          <div style={{ padding: '1.25rem 0', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : episodes.length === 0 ? (
          <div style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            No episodes found for Season {viewSeason}.
          </div>
        ) : (
          <div className="watching-ep-list">
            {episodes.map(ep => {
              const aired    = isAired(ep);
              const watched  = isWatched(ep);
              const isCurrent = viewSeason === progress.current_season
                && ep.episode_number === progress.current_episode;
              const isLoading = loadingEp === ep.episode_number;

              return (
                <div
                  key={ep.id ?? ep.episode_number}
                  className={[
                    'watching-ep-item',
                    watched   ? 'ep-watched'  : '',
                    isCurrent ? 'ep-current'  : '',
                    !aired    ? 'ep-future'   : '',
                  ].filter(Boolean).join(' ')}
                >
                  <button
                    className="ep-check-btn"
                    onClick={() => handleToggle(ep)}
                    disabled={!aired || isLoading}
                    aria-label={watched ? 'Mark unwatched' : 'Mark watched'}
                  >
                    {isLoading
                      ? <span className="ep-spinner" />
                      : watched
                        ? <CheckCircleIcon />
                        : <EmptyCircleIcon />
                    }
                  </button>

                  <div className="ep-info">
                    <span className="ep-num">
                      E{String(ep.episode_number).padStart(2, '0')}
                    </span>
                    {ep.name && <span className="ep-name">{ep.name}</span>}
                  </div>

                  {!aired && ep.air_date && (
                    <span className="ep-air-date">
                      {new Date(ep.air_date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Card-level actions */}
        <div className="watching-actions" style={{ marginTop: '0.75rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onOpen(progress.tmdb_id, 'tv')}
          >
            Details
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onStop(progress.tmdb_id)}
          >
            Stop watching
          </button>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   WatchingView
═══════════════════════════════════════ */
export default function WatchingView() {
  const { openPanel, watching, navigateTo } = useApp();

  const handleStop = async (tmdbId) => {
    if (window.confirm('Stop tracking this show?')) {
      await watching.stopWatching(tmdbId);
    }
  };

  if (watching.loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="sub-tabs">
        <span className="sub-tabs-date"><TodayLabel /></span>
        <span className="sub-tabs-subtitle">
          {watching.items.length > 0
            ? `${watching.items.length} show${watching.items.length > 1 ? 's' : ''} in progress`
            : "Track what you're watching"}
        </span>
      </div>

      {watching.items.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, opacity: 0.35 }}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div className="empty-title">Nothing in progress</div>
          <div className="empty-body">
            Search for a TV show and tap "Start Watching" to track your episodes.
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: '0.5rem' }}
            onClick={() => navigateTo('search')}
          >
            Find shows to watch
          </button>
        </div>
      ) : (
        <div className="watching-list">
          {watching.items.map(progress => (
            <WatchingCard
              key={progress.tmdb_id}
              progress={progress}
              watching={watching}
              onOpen={openPanel}
              onStop={handleStop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

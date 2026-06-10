import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp, backdropUrl, logoUrl, countdownChip, formatDate } from '../App.jsx';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';
import { useHistory } from '../hooks/useHistory.js';
import { ratingFromPointer, ratingToStars, starFillPercent, STAR_COUNT } from '../utils/ratings.js';
import LoadingSpinner from './LoadingSpinner.jsx';

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
  const checkingEpRef = useRef(false); // sync guard to prevent double-tap race

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
          const stamp = ep.airstamp ?? null;
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
    if (!currentProgress || checkingEpRef.current) return;
    checkingEpRef.current = true;
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

    checkingEpRef.current = false;
    setCheckingEp(null);
  }, [currentProgress, watching, tvId, selSeason, episodes.length]);

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
        <LoadingSpinner />
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
/* ── Heart icon ── */
function HeartIcon({ filled }) {
  const path = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";
  return (
    <svg viewBox="0 0 24 24" width="14" height="14"
      fill={filled ? 'var(--accent)' : 'none'}
      stroke={filled ? 'var(--accent)' : 'currentColor'}
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={path}/>
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function CheckSmallIcon({ color } = {}) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
      stroke={color || 'currentColor'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function PlaySmallIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round">
      <polygon points="4,3 12.75,8 4,13"/>
    </svg>
  );
}
function StopSmallIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round">
      <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="1"/>
    </svg>
  );
}
function StarIcon({ fillPercent = 0 }) {
  return (
    <span className="half-star-glyph half-star-glyph--svg" aria-hidden="true">
      <svg className="half-star-svg half-star-empty" viewBox="0 0 24 24">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <span className="half-star-fill half-star-fill--svg" style={{ width: `${fillPercent}%` }}>
        <svg className="half-star-svg" viewBox="0 0 24 24">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </span>
    </span>
  );
}

/* ── Add to custom list sheet ── */
function AddToCustomListSheet({ details, itemId, itemType, onClose }) {
  const { customLists } = useApp();
  const { lists, createList, addItem, removeItem, isInList } = customLists;
  const [creatingName, setCreatingName] = useState('');
  const [showCreate,   setShowCreate]   = useState(false);

  const item = {
    id: itemId,
    media_type: itemType,
    title: details?.title || details?.name || '',
    poster_path: details?.poster_path || null,
  };

  const handleCreate = async () => {
    if (!creatingName.trim()) return;
    const newList = await createList(creatingName);
    if (newList) await addItem(newList.id, item);
    setCreatingName('');
    setShowCreate(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Add to list</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {lists.length === 0 && !showCreate && (
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No lists yet
            </div>
          )}
          {lists.map(list => {
            const checked = isInList(list.id, itemId);
            return (
              <button
                key={list.id}
                onClick={() => checked ? removeItem(list.id, itemId) : addItem(list.id, item)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '0.75rem 1rem',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  background: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{list.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{(list.items || []).length} items</div>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  border: `2px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
                  background: checked ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {checked && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{ width: 12, height: 12 }}><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              </button>
            );
          })}
          {showCreate ? (
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="List name…"
                value={creatingName}
                onChange={e => setCreatingName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
                style={{
                  flex: 1, padding: '0.4rem 0.6rem',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--bg)', color: 'var(--text-primary)',
                  fontSize: '0.875rem', outline: 'none',
                }}
              />
              <button className="btn btn-primary btn-xs" disabled={!creatingName.trim()} onClick={handleCreate}>Create</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowCreate(false)}>✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                width: '100%', padding: '0.75rem 1rem',
                border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                color: 'var(--text-secondary)', fontSize: '0.875rem',
              }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
              Create new list
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function dedupeProviders(list) {
  const seen = new Set();
  return list.filter(p => {
    if (seen.has(p.provider_id)) return false;
    seen.add(p.provider_id);
    return true;
  });
}

export default function MediaPanel({ itemId, itemType, closing, onClose }) {
  const { watchlist, watching, user, profile, favorites, customLists } = useApp();
  const timezone = profile?.timezone || null;
  const history = useHistory(user?.id);

  const [details,      setDetails]      = useState(null);
  const [whereToWatch, setWhereToWatch] = useState({ streaming: [], rentBuy: [], inCinemas: false });
  const [loading,      setLoading]      = useState(true);
  const [detailsError, setDetailsError] = useState(false);

  const [showListSheet,  setShowListSheet]  = useState(false);
  const [localRating,    setLocalRating]    = useState(0);
  const [localReview,    setLocalReview]    = useState('');
  const [localDnf,       setLocalDnf]       = useState(false);
  const [reviewSaving,   setReviewSaving]   = useState(false);
  const reviewInputRef = useRef(null);

  const isMovie    = itemType === 'movie';
  const inList     = watchlist.isInList(itemId);
  const isWatching = !isMovie && watching.isWatching(itemId);
  const progress   = watching.getProgress(itemId);
  const watched    = history.isWatched(itemId);
  const isFav        = favorites.isFavorite(itemId);
  const isInAnyList  = customLists?.lists?.some(list => customLists.isInList(list.id, itemId)) ?? false;
  const watchedEntry = history.entries.find(e => e.tmdb_id === Number(itemId));
  const hasSavedReview = !!(
    watchedEntry?.rating ||
    watchedEntry?.note?.trim() ||
    watchedEntry?.dnf
  );
  const savedRating = watchedEntry?.rating || 0;
  const savedReview = watchedEntry?.note || '';
  const savedDnf = !!watchedEntry?.dnf;
  const hasReviewDraft = localRating > 0 || !!localReview.trim() || localDnf;
  const reviewDirty = !!watchedEntry && (
    localRating !== savedRating ||
    localReview.trim() !== savedReview.trim() ||
    localDnf !== savedDnf
  );
  const reviewStateClass = reviewDirty || (!hasSavedReview && hasReviewDraft)
    ? ' review-textarea--active'
    : hasSavedReview
      ? ' review-textarea--saved'
      : '';

  // Sync local review state when entry loads or changes
  useEffect(() => {
    if (watchedEntry) {
      setLocalRating(watchedEntry.rating || 0);
      setLocalReview(watchedEntry.note   || '');
      setLocalDnf(watchedEntry.dnf       || false);
    }
  }, [watchedEntry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const regionData = prov?.results?.[region] || {};
      const streaming = dedupeProviders([
        ...(regionData.flatrate || []),
        ...(regionData.free     || []),
        ...(regionData.ads      || []),
      ]);
      const rentBuy = dedupeProviders([
        ...(regionData.rent || []),
        ...(regionData.buy  || []),
      ]);
      // Cinema detection: movie released within last 90 days with no digital availability yet
      let inCinemas = false;
      if (isMovie) {
        const releaseDate = det.release_date ? new Date(det.release_date) : null;
        const daysSinceRelease = releaseDate
          ? (Date.now() - releaseDate.getTime()) / 86400000
          : null;
        const hasDigital = streaming.length > 0 || rentBuy.length > 0;
        inCinemas = (
          det.status === 'Released' &&
          daysSinceRelease !== null &&
          daysSinceRelease >= 0 &&
          daysSinceRelease <= 90 &&
          !hasDigital
        );
      }
      setWhereToWatch({ streaming, rentBuy, inCinemas });
    }
    setLoading(false);
  }, [itemId, itemType, isMovie]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  const title   = details?.title || details?.name || '';
  const rating  = details?.vote_average ? `${details.vote_average.toFixed(1)} ★` : '';
  const genres  = (details?.genres || []).slice(0, 3).map(g => g.name).join(' · ');
  const date    = details?.release_date || details?.first_air_date;
  const chip    = date ? countdownChip(date) : null;

  return (
    <>
      {showListSheet && details && (
        <AddToCustomListSheet
          details={details}
          itemId={itemId}
          itemType={itemType}
          onClose={() => setShowListSheet(false)}
        />
      )}
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
          <div className="panel-body">
            <LoadingSpinner />
          </div>
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
              {isMovie ? (
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Movie</span>
              ) : (
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Series{details?.number_of_seasons ? ` · ${details.number_of_seasons} season${details.number_of_seasons > 1 ? 's' : ''}` : ''}
                </span>
              )}
              {rating && <span style={{ fontSize: '0.8rem', color: '#F59E0B', fontWeight: 600 }}>{rating}</span>}
              {date && (
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {chip && chip.cls !== 'chip-muted' && (
                <span className={`chip ${chip.cls}`}>{chip.label}</span>
              )}
            </div>

            {genres && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{genres}</div>
            )}

            {/* Overview */}
            {details?.overview && (
              <p className="panel-overview">{details.overview}</p>
            )}

            {/* Trailer */}
            {(() => {
              const videos = details?.videos?.results || [];
              const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                || videos.find(v => v.site === 'YouTube' && v.type === 'Teaser')
                || videos.find(v => v.site === 'YouTube');
              if (!trailer) return null;
              return (
                <div style={{ marginBottom: '1rem', borderRadius: '0.75rem', overflow: 'hidden', aspectRatio: '16/9' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${trailer.key}?rel=0`}
                    title={trailer.name || 'Trailer'}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              );
            })()}

            {/* ── Action buttons: 2×2 grid ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>

              {/* Row 1: Save + Mark watched */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* Save / Saved */}
                <button
                  onClick={() => watchlist.toggle({ ...details, id: itemId, media_type: itemType })}
                  style={{
                    flex: 1, padding: '0.52rem 0.5rem', borderRadius: '0.75rem',
                    border: inList ? '1.5px solid rgba(74,222,128,0.2)' : '1.5px solid transparent',
                    cursor: 'pointer',
                    background: inList ? '#0d2d1a' : 'var(--accent)',
                    color: inList ? '#4ade80' : '#fff',
                    fontWeight: 600, fontSize: '0.88rem', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  }}
                >
                  {inList ? <><CheckSmallIcon color="#4ade80" /> Saved</> : 'Save'}
                </button>

                {/* Mark watched / Watched (undo) */}
                {!watched ? (
                  <button
                    style={{
                      flex: 1, padding: '0.52rem 0.5rem', borderRadius: '0.75rem',
                      border: '1.5px solid var(--border)', background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontWeight: 500, fontSize: '0.82rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    }}
                    onClick={async () => {
                      await history.logWatched({ ...details, id: itemId, media_type: itemType });
                      if (!isMovie && isWatching) await watching.stopWatching(itemId);
                    }}
                  >
                    <CheckSmallIcon /> {!isMovie ? 'Mark watched' : 'Mark watched'}
                  </button>
                ) : (
                  <button
                    onClick={() => history.removeEntry(itemId)}
                    style={{
                      flex: 1, padding: '0.52rem 0.5rem', borderRadius: '0.75rem',
                      border: '1.5px solid rgba(74,222,128,0.2)',
                      cursor: 'pointer', background: '#0d2d1a', color: '#4ade80',
                      fontWeight: 600, fontSize: '0.88rem', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    }}
                  >
                    <CheckSmallIcon color="#4ade80" /> Watched
                  </button>
                )}
              </div>

              {/* Row 2: Favourite + Add to list */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => favorites.toggleFavorite({ ...details, id: itemId, media_type: itemType })}
                  style={{
                    flex: 1, padding: '0.52rem 0.5rem', borderRadius: '0.75rem',
                    border: isFav ? '1.5px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1.5px solid var(--border)',
                    background: isFav ? 'var(--accent-dim)' : 'transparent',
                    color: isFav ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, transition: 'all 0.18s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.38rem',
                  }}
                >
                  <HeartIcon filled={isFav} />
                  {isFav ? 'Favourited' : 'Favourite'}
                </button>

                <button
                  onClick={() => setShowListSheet(true)}
                  style={{
                    flex: 1, padding: '0.52rem 0.5rem', borderRadius: '0.75rem',
                    border: isInAnyList ? '1.5px solid rgba(99,102,241,0.4)' : '1.5px solid var(--border)',
                    background: isInAnyList ? 'rgba(99,102,241,0.1)' : 'transparent',
                    color: isInAnyList ? '#818cf8' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, transition: 'all 0.18s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.38rem',
                  }}
                >
                  {isInAnyList
                    ? <><CheckSmallIcon color="#818cf8" /> On your list</>
                    : <><PlusIcon /> Add to list</>
                  }
                </button>
              </div>

              {/* TV only: Start / Stop watching */}
              {!isMovie && !watched && (
                <button
                  style={{
                    width: '100%', padding: '0.52rem 0.5rem', borderRadius: '0.75rem',
                    border: isWatching ? '1.5px solid rgba(99,102,241,0.45)' : '1.5px solid var(--border)',
                    background: isWatching ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: isWatching ? '#818cf8' : 'var(--text-secondary)',
                    fontWeight: 500, fontSize: '0.82rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    transition: 'all 0.18s',
                  }}
                  onClick={async () => {
                    if (isWatching) {
                      await watching.stopWatching(itemId);
                    } else {
                      await watching.startWatching({ ...details, id: itemId, media_type: 'tv' });
                      if (inList) await watchlist.removeFromList(itemId);
                    }
                  }}
                >
                  {isWatching
                    ? <><StopSmallIcon /> Stop watching</>
                    : <><PlaySmallIcon /> Start watching</>
                  }
                </button>
              )}
            </div>

            {/* Review section (when watched) */}
            {watched && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ height: 1, marginBottom: '0.85rem' }} />

                {/* Review section label */}
                <div style={{
                  fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.65rem',
                }}>
                  Your review
                </div>

                {/* Stars + DNF */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                  {/* Star rating */}
                  <div
                    className="half-star-rating"
                    aria-label={localRating ? `${ratingToStars(localRating)} out of 5 stars` : 'No rating'}
                  >
                    {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        className="review-star-btn"
                        onClick={e => {
                          const rating = ratingFromPointer(e, n);
                          setLocalRating(r => r === rating ? 0 : rating);
                        }}
                        aria-label={`Rate ${n - 0.5} or ${n} stars`}
                      >
                        <StarIcon fillPercent={starFillPercent(localRating, n)} />
                      </button>
                    ))}
                  </div>

                  {/* Didn't finish chip */}
                  <button
                    onClick={() => setLocalDnf(d => !d)}
                    style={{
                      padding: '5px 11px', borderRadius: 999,
                      border: localDnf ? '1.5px solid rgba(251,146,60,0.5)' : '1.5px solid var(--border)',
                      background: localDnf ? 'rgba(251,146,60,0.12)' : 'transparent',
                      color: localDnf ? '#fb923c' : 'var(--text-muted)',
                      fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.18s',
                    }}
                  >
                    {localDnf && <CheckSmallIcon color="#fb923c" />}
                    Didn't finish
                  </button>
                </div>

                {/* Review text */}
                <div style={{ position: 'relative', marginBottom: '0.65rem' }}>
                  <textarea
                    ref={reviewInputRef}
                    className={`review-textarea${reviewStateClass}`}
                    value={localReview}
                    onChange={e => { if (e.target.value.length <= 280) setLocalReview(e.target.value); }}
                    placeholder="Write a quick review…"
                    rows={3}
                  />
                  <span style={{
                    position: 'absolute', bottom: '0.55rem', right: '0.65rem',
                    fontSize: '0.62rem', fontVariantNumeric: 'tabular-nums',
                    color: (280 - localReview.length) <= 40
                      ? (280 - localReview.length) <= 0 ? '#ef4444' : '#f59e0b'
                      : 'var(--text-muted)',
                  }}>
                    {280 - localReview.length}
                  </span>
                </div>

                {/* Save button — only when something to save */}
                {(hasSavedReview || hasReviewDraft) && (
                  <button
                    className={`review-action-btn${reviewDirty || (!hasSavedReview && hasReviewDraft) ? ' review-action-btn--active' : hasSavedReview ? ' review-action-btn--saved' : ''}`}
                    disabled={reviewSaving}
                    onClick={async () => {
                      if (hasSavedReview && !reviewDirty) {
                        reviewInputRef.current?.focus();
                        return;
                      }
                      setReviewSaving(true);
                      await history.updateEntry(itemId, {
                        rating: localRating || null,
                        note:   localReview.trim() || null,
                        dnf:    localDnf,
                      });
                      setReviewSaving(false);
                    }}
                  >
                    {reviewSaving
                      ? 'Saving…'
                      : hasSavedReview
                        ? reviewDirty ? 'Save changes' : 'Edit review'
                        : 'Save review'
                    }
                  </button>
                )}
              </div>
            )}

            {/* Where to watch */}
            {(whereToWatch.streaming.length > 0 || whereToWatch.rentBuy.length > 0 || whereToWatch.inCinemas) && (
              <>
                <div className="panel-section-title">Where to Watch</div>
                {whereToWatch.inCinemas && (
                  <div className="providers-grid">
                    <div className="provider-chip provider-chip--cinema">
                      In Cinemas
                    </div>
                  </div>
                )}
                {whereToWatch.streaming.length > 0 && (
                  <div className="providers-grid">
                    {whereToWatch.streaming.map(p => (
                      <div key={p.provider_id} className="provider-chip">
                        {p.logo_path && (
                          <img src={logoUrl(p.logo_path, 'w45')} alt={p.provider_name} />
                        )}
                        {p.provider_name}
                      </div>
                    ))}
                  </div>
                )}
                {whereToWatch.rentBuy.length > 0 && (
                  <>
                    {whereToWatch.streaming.length > 0 && (
                      <div className="providers-sublabel">Rent or Buy</div>
                    )}
                    <div className="providers-grid">
                      {whereToWatch.rentBuy.map(p => (
                        <div key={p.provider_id} className="provider-chip provider-chip--rentbuy">
                          {p.logo_path && (
                            <img src={logoUrl(p.logo_path, 'w45')} alt={p.provider_name} />
                          )}
                          {p.provider_name}
                        </div>
                      ))}
                    </div>
                  </>
                )}
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

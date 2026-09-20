import PrivateNote from './PrivateNote.jsx';
import { customListCreationError } from '@plot/core/customListCreation.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../hooks/useApp.js';
import { countdownChip, formatDate } from '../utils/countdown.js';
import { backdropUrl, logoUrl, posterUrl, profileUrl } from '../utils/images.js';
import { tmdb, getTmdbRegion } from '@plot/core/tmdb.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { recommendationsFromDetails } from '@plot/core/media.js';
import { useHistory } from '../hooks/useHistory.js';
import { localDateStr } from '../utils/date.js';
import { getEpisodeGuideState } from '../utils/episodeProgress.js';
import { markMediaAsWatched, moveSavedShowToWatching } from '../utils/mediaStatus.js';
import { resolveMediaPanelEscapeAction } from '../utils/mediaPanel.js';
import { pickBestTvmazeShowMatch } from '../utils/tvmaze.js';
import { favoriteWords } from '../utils/spelling.js';
import { starFillPercent, STAR_COUNT } from '../utils/ratings.js';
import { privateNoteKey } from '@plot/core/privateNotes.js';
import { formatWatchedOn } from '@plot/core/date.js';
import { useShareTitle } from '../hooks/useShareTitle.js';
import { track, EVENTS, captureException } from '../lib/analytics.js';
import CreditsGrid from './TalentCredits.jsx';
import CollectionCard from './CollectionCard.jsx';
import { creditMeta, creditTitle, dedupedActingCredits, mediaType, shortBiography } from '../utils/talentCredits.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { TOP_LIST_SIZE } from '@plot/core/listCollections.js';
import { buildWatchLink } from '@plot/core/watchLinks.js';
import {
  getLastSeasonNumber,
  getSeasonToggleProgress,
  getSeasonWatchState,
  isSeriesComplete,
} from '@plot/core/watchingProgress.js';
import { fetchVerifiedAvailability, formatOfferPrice, offersFromTmdb, networksFromDetails, regionDisplayName } from '@plot/core/availability.js';
import { fetchCriticScore, pickAudienceQuote, getConsensusLine, audienceScoreFromDetails } from '@plot/core/reviews.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import SheetHeader from './SheetHeader.jsx';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import Spinner from './Spinner.jsx';
import TitleReview from './TitleReview.jsx';
import StarIcon from './StarIcon.jsx';
import KebabMenu from './KebabMenu.jsx';
import { COMMON } from '../copy/common.js';
import { MEDIA } from '../copy/media.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';

/* ── Close icon ── */
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

/* ── Back icon ── */
function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

/* ── Talent (cast member) mini-profile shown inline within the panel ──
   Presentational only: the panel owns the fetch. Uses a portrait
   thumbnail rather than a full-bleed header image — a portrait crop
   stretched across a 16:9 backdrop zooms in on the face awkwardly. ── */
function TalentPanelView({ person, credits, error, onOpenTitle }) {
  if (!person && !error) {
    return <div style={{ padding: '2rem 0', textAlign: 'center' }}><LoadingSpinner /></div>;
  }
  if (error) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '1rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Couldn't load this profile.</div>
      </div>
    );
  }

  const actingCredits = dedupedActingCredits(credits?.cast).slice(0, 12);
  const image = profileUrl(person.profile_path, 'h632');
  const knownFor = person.known_for_department || MEDIA_PANEL.talentFallback;
  const biographyPreview = shortBiography(person.biography);

  return (
    <div className="panel-talent-view">
      <header className="talent-header">
        <div className="talent-portrait">
          {image ? <img src={image} alt={person.name} /> : <span aria-hidden="true">{person.name?.charAt(0)}</span>}
        </div>
        <div>
          <div className="talent-kicker">{knownFor}</div>
          <h1>{person.name}</h1>
          {person.birthday && <p className="talent-birthday">Born {new Date(person.birthday).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
        </div>
      </header>
      {person.biography && <p className="talent-biography">{biographyPreview}</p>}
      <section className="talent-section">
        <CreditsGrid credits={actingCredits} openPanel={onOpenTitle} />
        {!actingCredits.length && <p className="talent-muted">No screen credits available.</p>}
      </section>
    </div>
  );
}

/* ── Action-cluster icons (1.25rem tray glyphs + Save affordance) ── */
function ShareIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}
function BookmarkIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function CheckIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function ChevronIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function LockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
function StatusIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
    </svg>
  );
}
function ListIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="14" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
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

/* ── Up next: the mid-watch summary for a series ──
   A series you are part-way through is asking one question — what do I watch
   now — and the panel used to answer it only if you scrolled to the episode
   guide and counted. This says it at the top: the episode the pointer is on,
   where it plays, and the two things you might do about it.

   It reads the same pointer the guide does and advances it through the same
   `markEpisodeWatched`, so the card and the list can't disagree. ── */
function UpNextCard({ tvId, details, progress, whereToWatch, onSeriesFinished }) {
  const { watching } = useApp();
  const [episodes, setEpisodes] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const season = progress?.current_season || 0;
  const episodeNumber = progress?.current_episode || 0;

  useEffect(() => {
    if (!season) return;
    let cancelled = false;
    tmdb.getSeason(tvId, season).then(data => {
      if (!cancelled) setEpisodes(data?.episodes || []);
    });
    return () => { cancelled = true; };
  }, [tvId, season]);

  const episode = episodes.find(e => e.episode_number === episodeNumber);
  if (!season || !episodeNumber) return null;

  const watchedInSeason = Math.max(0, episodeNumber - 1);
  const seasonTotal = episodes.length;
  const offer = whereToWatch.streaming[0] || whereToWatch.rentBuy[0] || null;
  const link = offer && buildWatchLink({ providerUrl: offer.providerUrl, justwatchLink: whereToWatch.justwatchLink });
  const still = episode?.still_path ? backdropUrl(episode.still_path, 'w300') : null;
  const runtime = episode?.runtime ? MEDIA_PANEL.episodeRuntime(episode.runtime) : '';
  // The button names the provider, so the meta line only carries it when
  // there is no button to open.
  const where = [link ? '' : offer?.providerName, runtime].filter(Boolean).join(' · ');

  const markWatched = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    const result = await watching.markEpisodeWatched(tvId);
    if (!result?.ok) {
      setError(result?.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
    } else if (isSeriesComplete({
      lastSeason: getLastSeasonNumber(details),
      nextSeason: result.data?.current_season,
      status: details?.status,
    })) {
      track(EVENTS.SERIES_COMPLETED, { tmdb_id: tvId, seasons: getLastSeasonNumber(details) });
      const finished = await onSeriesFinished?.();
      if (finished && !finished.ok) setError(finished.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
    }
    setPending(false);
  };

  return (
    <section className="panel-card panel-upnext">
      <h3 className="panel-card-title panel-upnext-title">{MEDIA_PANEL.upNext}</h3>
      <div className="panel-upnext-row">
        <div className="panel-upnext-still">
          {still && <img src={still} alt="" />}
        </div>
        <div className="panel-upnext-copy">
          <div className="panel-upnext-kicker">{MEDIA_PANEL.seasonEpisode(season, episodeNumber)}</div>
          <div className="panel-upnext-name">{episode?.name || MEDIA_PANEL.seasonEpisode(season, episodeNumber)}</div>
          {where && <div className="panel-upnext-where">{where}</div>}
        </div>
        <div className="panel-upnext-actions">
          <button className="panel-pill panel-pill--primary" onClick={markWatched} disabled={pending}>
            <CheckIcon />
            {pending ? MEDIA_PANEL.updating : MEDIA.markWatched}
          </button>
          {link && offer && (
            <a className="panel-pill panel-pill--ghost" href={link.url} target="_blank" rel="noopener">
              {MEDIA_PANEL.openOn(offer.providerName)}
            </a>
          )}
        </div>
      </div>
      {seasonTotal > 0 && (
        <div
          className="panel-upnext-progress"
          role="progressbar"
          aria-valuenow={watchedInSeason}
          aria-valuemin={0}
          aria-valuemax={seasonTotal}
          aria-label={MEDIA_PANEL.seasonWatchedCount(watchedInSeason, seasonTotal)}
        >
          <span style={{ width: `${Math.round((watchedInSeason / seasonTotal) * 100)}%` }} />
        </div>
      )}
      {error && <p className="panel-upnext-error" role="alert">{error}</p>}
    </section>
  );
}

/* ── Season selector + episode list ── */
function EpisodeGuide({ tvId, currentProgress, details, timezone, onSeriesFinished }) {
  const { watching } = useApp();
  const seasons     = (details?.seasons || []).filter(s => s.season_number > 0);
  const [selSeason, setSelSeason] = useState(currentProgress?.current_season || 1);
  const [episodes,  setEpisodes]  = useState([]);
  const [epLoading, setEpLoading] = useState(false);
  const [epError,   setEpError]   = useState(false);
  const [checkingEp, setCheckingEp] = useState(null); // ep number being toggled
  const [episodeActionError, setEpisodeActionError] = useState('');
  const [seasonPending, setSeasonPending] = useState(false);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- episode fetch toggles local loading/error state
    setEpLoading(true);
    setEpError(false);
    setEpisodeActionError('');
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
        const searchRes = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(name)}`);
        if (!searchRes.ok || cancelled) return;
        const results = await searchRes.json();
        if (!Array.isArray(results) || cancelled) return;

        const { match, reason } = pickBestTvmazeShowMatch(results, details);
        if (!match?.id || cancelled) {
          if (import.meta.env.DEV && reason === 'ambiguous-match') {
            console.debug('[MediaPanel] Skipping ambiguous TVMaze match for', name, details?.first_air_date);
          }
          return;
        }

        const epRes = await fetch(`https://api.tvmaze.com/shows/${match.id}/episodes`);
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
  }, [details]);

  /* ── Determine per-episode watched state ── */
  const currentSeason = currentProgress?.current_season || 0;
  const currentEp     = currentProgress?.current_episode || 0;

  /* ── Finish the series when progress rolls past its final season ──
     Watching the last episode of an ended show's last season is the show
     finishing, so it should stop being "currently watching" and land in your
     history. Without this the pointer parks on a season that will never air
     and the show sits in the watching list forever. Shows still in production
     are left alone: passing their latest season means up to date, not done. */
  const lastSeason = getLastSeasonNumber(details);

  const finishSeriesIfComplete = useCallback(async (nextSeason) => {
    if (!isSeriesComplete({ lastSeason, nextSeason, status: details?.status })) return;
    // Finishing a show is the end of the engagement arc worth naming, and it's
    // only knowable here — core sees pointer moves, not the last season.
    track(EVENTS.SERIES_COMPLETED, { tmdb_id: tvId, seasons: lastSeason });
    const result = await onSeriesFinished?.();
    if (result && !result.ok) {
      setEpisodeActionError(result.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
    }
  }, [details?.status, lastSeason, onSeriesFinished, tvId]);

  /* ── Toggle an episode's watched state ── */
  const handleCheckEp = useCallback(async (ep, watched) => {
    if (!currentProgress || checkingEpRef.current) return;
    checkingEpRef.current = true;
    setCheckingEp(ep.episode_number);
    setEpisodeActionError('');

    if (!watched) {
      // Mark watched: advance progress past this episode
      if (selSeason === currentSeason && ep.episode_number === currentEp) {
        const result = await watching.markEpisodeWatched(tvId);
        if (!result?.ok) {
          setEpisodeActionError(result?.error || 'Could not update this episode right now. Please try again.');
        } else {
          // markEpisodeWatched handles season rollover internally, so the row
          // it returns is the only reliable read of where the pointer landed.
          await finishSeriesIfComplete(result.data?.current_season);
        }
      } else if (ep.episode_number < episodes.length) {
        await watching.setProgress(tvId, selSeason, ep.episode_number + 1);
      } else {
        // Last episode of season → advance to next season
        const nextSeason = selSeason + 1;
        await watching.setProgress(tvId, nextSeason, 1);
        userChangedSeason.current = false; // allow auto-follow to next season
        await finishSeriesIfComplete(nextSeason);
      }
    } else {
      // Unmark: pull progress back to this episode
      await watching.setProgress(tvId, selSeason, ep.episode_number);
    }

    checkingEpRef.current = false;
    setCheckingEp(null);
  }, [currentEp, currentProgress, currentSeason, watching, tvId, selSeason, episodes.length, finishSeriesIfComplete]);

  /* ── Mark / unmark the whole selected season ── */
  const seasonState = getSeasonWatchState({
    currentEpisode: currentEp,
    currentSeason,
    episodeCount: episodes.length,
    selectedSeason: selSeason,
  });

  const handleToggleSeason = useCallback(async () => {
    if (!currentProgress || seasonPending || checkingEpRef.current) return;
    const target = getSeasonToggleProgress({
      isComplete: seasonState.isComplete,
      selectedSeason: selSeason,
    });
    if (!target.ok) {
      setEpisodeActionError(target.error);
      return;
    }

    setSeasonPending(true);
    setEpisodeActionError('');
    // Marking rolls progress into the NEXT season, which would trip the
    // auto-follow effect and swap the list out from under the button that was
    // just pressed. Pin the selection so the season you acted on stays on
    // screen and visibly flips to fully watched.
    userChangedSeason.current = true;
    const result = await watching.setProgress(tvId, target.nextSeason, target.nextEpisode, { reason: 'season' });
    if (!result?.ok) {
      setEpisodeActionError(MEDIA_PANEL.couldNotUpdateSeason);
    } else if (!seasonState.isComplete) {
      await finishSeriesIfComplete(target.nextSeason);
    }
    setSeasonPending(false);
  }, [currentProgress, seasonPending, seasonState.isComplete, selSeason, watching, tvId, finishSeriesIfComplete]);

  const isTracking = !!currentProgress;

  return (
    <div>
      {/* Season picker and the season-level action share one line: the season
          as a pill you open, the bulk action as plain text on the right. The
          chip-per-season strip it replaces grew a row for every season. */}
      <div className="season-row">
        {seasons.length > 1 ? (
          <div className="season-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setSeasonMenuOpen(false); }}>
            <button
              type="button"
              className="panel-pill season-pill"
              onClick={() => setSeasonMenuOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={seasonMenuOpen}
            >
              {MEDIA_PANEL.seasonLabel(selSeason)}
              <ChevronIcon size={13} />
            </button>
            {seasonMenuOpen && (
              <div className="panel-status-menu season-menu" role="menu" aria-label={MEDIA_PANEL.chooseSeason}>
                {seasons.map(s => (
                  <button
                    key={s.season_number}
                    role="menuitem"
                    className={`panel-status-option${s.season_number === selSeason ? ' panel-status-option--current' : ''}`}
                    onClick={() => {
                      userChangedSeason.current = true;
                      setSelSeason(s.season_number);
                      setSeasonMenuOpen(false);
                    }}
                  >
                    {MEDIA_PANEL.seasonLabel(s.season_number)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="panel-pill season-pill season-pill--static">{MEDIA_PANEL.seasonLabel(selSeason)}</span>
        )}

        {isTracking && episodes.length > 0 && (
          <button
            type="button"
            className="season-bulk-link"
            onClick={handleToggleSeason}
            disabled={seasonPending}
          >
            {seasonPending
              ? MEDIA_PANEL.updating
              : seasonState.isComplete
                ? MEDIA_PANEL.unmarkSeasonWatched
                : MEDIA_PANEL.markSeasonWatched}
          </button>
        )}
      </div>

      {episodeActionError && (
        <div style={{
          marginBottom: '0.85rem',
          padding: '0.7rem 0.85rem',
          borderRadius: '0.85rem',
          border: '1px solid var(--danger-border)',
          background: 'var(--danger-dim)',
          color: 'var(--danger)',
          fontSize: '0.78rem',
          lineHeight: 1.45,
        }}>
          {episodeActionError}
        </div>
      )}

      {epLoading ? (
        <LoadingSpinner />
      ) : episodes.length === 0 ? (
        <div style={{ padding: '1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {epError ? MEDIA_PANEL.episodesLoadError : MEDIA_PANEL.noEpisodesAvailable}
        </div>
      ) : (
        <div className="episode-list">
          {episodes.map(ep => {
            const { isActive, isCurrent, isWatched: watched } = getEpisodeGuideState({
              currentEpisode: currentEp,
              currentSeason,
              episodeNumber: ep.episode_number,
              selectedSeason: selSeason,
            });
            const chip       = ep.air_date ? countdownChip(ep.air_date) : null;
            const isUpcoming = chip && chip.cls !== 'chip-muted';
            const airstamp   = isUpcoming ? tvmazeTimes[`${selSeason}-${ep.episode_number}`] : null;
            const airTime    = airstamp ? fmtAirstamp(airstamp, timezone) : null;
            const isChecking = checkingEp === ep.episode_number;

            return (
              <div
                key={ep.episode_number}
                className={`ep-row${watched ? ' watched' : ''}${isCurrent ? ' ep-current' : ''}`}
                onClick={isTracking && !isChecking ? () => handleCheckEp(ep, watched) : undefined}
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
                    <span className="ep-check-btn" aria-hidden="true">
                      <Spinner size={14} ariaHidden />
                    </span>
                  ) : (
                    <button
                      className={`ep-check-btn${isActive ? ' checked' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleCheckEp(ep, watched); }}
                      aria-label={watched ? MEDIA.markUnwatched : MEDIA.markWatched}
                      title={watched ? MEDIA_PANEL.unmarkAsWatched : MEDIA_PANEL.markAsWatched}
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
function HeartIcon({ filled, size = 15 }) {
  const path = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={path}/>
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function PlaySmallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  );
}
function StopSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}

/* ── Where-to-watch provider chip ── */
// Clickable only for a verified provider offer or the region-specific title page.
function ProviderChip({ provider, tmdbId, mediaType, region, justwatchLink }) {
  const link = buildWatchLink({
    providerUrl: provider.providerUrl,
    justwatchLink,
  });
  const className = `provider-chip${provider.offerType === 'Rent' || provider.offerType === 'Buy' ? ' provider-chip--rentbuy' : ''}${link ? ' provider-chip--link' : ''}`;
  const price = formatOfferPrice(provider.price, provider.currency);
  const inner = (
    <>
      {provider.logoPath && (
        <img src={provider.logoPath.startsWith('http') ? provider.logoPath : logoUrl(provider.logoPath, 'w45')} alt={provider.providerName} />
      )}
      <span>{provider.providerName}</span>
      <span className="provider-chip-offer">{price || provider.offerType}</span>
    </>
  );
  if (!link) return <div className={className}>{inner}</div>;
  return (
    <a
      className={className}
      href={link.url}
      target="_blank"
      rel={link.kind === 'provider' ? 'noopener nofollow sponsored' : 'noopener'}
      onClick={() => track(EVENTS.WATCH_LINK_CLICKED, {
        provider_id: provider.providerId,
        provider_name: provider.providerName,
        tmdb_id: tmdbId,
        media_type: mediaType,
        monetization: provider.offerType.toLowerCase().replaceAll(' ', '_'),
        link_kind: link.kind,
        region,
      })}
    >
      {inner}
    </a>
  );
}

/* ── Full-width pill button, styled like ConfirmModal's dialog buttons ── */
function pillButtonStyle(variant) {
  return {
    width: '100%',
    padding: '0.7rem 1.1rem',
    borderRadius: '9999px',
    border: 'none',
    fontSize: '0.85rem',
    fontWeight: variant === 'solid' ? 600 : 500,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    background: variant === 'solid' ? 'var(--accent)' : 'var(--surface-raised)',
    color: variant === 'solid' ? '#fff' : 'var(--text-primary)',
  };
}

/* ── Your take: the bar pinned to the foot of the panel ──
   Present whether or not anything has been written, so your rating, your review
   and your private note are one tap from any scroll position rather than a
   section to scroll for. Collapsed it summarises; open it holds the same review
   slip and note editor as before.

   A separate component for the same reason TitleReview is one: reading
   `watchedEntry`-derived values in the panel's own render body makes the React
   Compiler bail out of the manual memoization on its watch-status callbacks. ── */
function TakeBar({ itemId, itemType, title, watched, watchedEntry, rating, note, dnf, watchedAt, onSave, onClear, user }) {
  const { privateNotes } = useApp();
  const [open, setOpen] = useState(false);
  const hasPrivateNote = !!privateNotes?.rows?.[privateNoteKey(itemId, itemType)]?.note;
  const hasTake = !!(rating || note.trim() || dnf);
  const preview = hasTake
    ? (note.trim() || MEDIA_PANEL.watchedOnDate(formatWatchedOn(watchedAt)))
    : MEDIA_PANEL.takeHint;

  return (
    <div className={`panel-take${open ? ' panel-take--open' : ''}`}>
      <button
        type="button"
        className="panel-disclosure panel-take-head"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className="panel-take-stars" aria-hidden="true">
          {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map(n => (
            <StarIcon key={n} fillPercent={starFillPercent(rating, n)} />
          ))}
        </span>
        <span className="panel-take-summary">
          <b>{hasTake ? MEDIA_PANEL.yourTake : MEDIA_PANEL.leaveNoteOrReview}</b>
          <span>{preview}</span>
        </span>
        {hasPrivateNote && <LockIcon />}
        <ChevronIcon />
      </button>

      {open && (
        <div className="panel-take-body">
          {watched ? (
            <TitleReview
              entry={watchedEntry}
              rating={rating}
              note={note}
              dnf={dnf}
              watchedAt={watchedAt}
              onSave={onSave}
              onClear={onClear}
            />
          ) : (
            <p className="panel-take-note">{MEDIA_PANEL.takeNeedsWatch}</p>
          )}
          {user && <PrivateNote id={itemId} type={itemType} title={title} />}
        </div>
      )}
    </div>
  );
}

/* ── Add to custom list sheet ── */
function AddToCustomListSheet({ details, itemId, itemType, onClose }) {
  const { customLists, topLists, profile } = useApp();
  const { lists, createList, addItem, removeItem, isInList } = customLists;
  const [creatingName, setCreatingName] = useState('');
  const [showCreate,   setShowCreate]   = useState(false);
  const [createError,  setCreateError]  = useState('');
  const [isCreating,   setIsCreating]   = useState(false);
  const [topOpen,      setTopOpen]      = useState(false);
  const [rankConflict, setRankConflict] = useState(null); // { rank, occupant }
  const [pickingMoveTo, setPickingMoveTo] = useState(false);

  const item = {
    id: itemId,
    media_type: itemType,
    title: details?.title || details?.name || '',
    poster_path: details?.poster_path || null,
  };

  const topListType = itemType === 'tv' ? 'tv' : 'movies';
  const topItems     = topLists?.lists?.[topListType] || [];
  const currentRank  = topItems.find(t => t.tmdb_id === itemId)?.rank;

  const duplicateList = findDuplicateCustomList(lists, creatingName);

  const handleCreate = async () => {
    if (!creatingName.trim() || isCreating) return;
    if (duplicateList) {
      setCreateError(`"${duplicateList.name}" already exists.`);
      return;
    }
    if (!canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setCreateError(CUSTOM_LISTS.limitMessage);
      return;
    }

    setIsCreating(true);
    setCreateError('');
    try {
      const newList = await createList(creatingName);
      if (!newList) {
        setCreateError(MEDIA.couldNotCreateList);
        return;
      }

      const added = await addItem(newList.id, item);
      if (!added) {
        setCreateError('The list was created, but the title could not be added. Please try again.');
        return;
      }

      setCreatingName('');
      setShowCreate(false);
    } catch (error) {
      setCreateError(customListCreationError(error, MEDIA.couldNotCreateList));
    } finally {
      setIsCreating(false);
    }
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
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0.5rem auto 0' }} />
        <SheetHeader title="Add to list" onClose={onClose} bordered={false} />
        {!!topLists && (
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setTopOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '0.75rem 1rem',
                border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  {topListType === 'tv' ? MEDIA_PANEL.topFiveTvShows : MEDIA_PANEL.topFiveMovies}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {currentRank ? MEDIA_PANEL.currentlyRanked(currentRank) : MEDIA_PANEL.notRanked}
                </div>
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: 4,
                border: `2px solid ${currentRank ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: currentRank ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: '0.7rem', color: '#fff', fontWeight: 600,
              }}>
                {currentRank || ''}
              </div>
            </button>
            {topOpen && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem',
                padding: '0 1rem 0.75rem',
              }}>
                {Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1).map(rank => {
                  const occupant = topItems.find(t => t.rank === rank);
                  const isThis = occupant?.tmdb_id === itemId;
                  return (
                    <button
                      key={rank}
                      onClick={() => {
                        if (isThis) { topLists.removeSlot(topListType, itemId); return; }
                        if (occupant) { setRankConflict({ rank, occupant }); return; }
                        topLists.setSlot(topListType, rank, item);
                      }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '0.4rem 0.2rem', minHeight: 44,
                        border: `1px solid ${isThis ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 8,
                        background: isThis ? 'var(--accent)' : 'transparent',
                        color: isThis ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer', fontSize: '0.72rem',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{rank}</span>
                      {occupant && !isThis && (
                        <span style={{
                          color: 'var(--text-muted)', fontSize: '0.6rem',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                        }}>
                          {occupant.title}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {rankConflict && (
          <div
            onClick={() => { setRankConflict(null); setPickingMoveTo(false); }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1200,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.5rem',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 360,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-overlay)',
                padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}
            >
              {!pickingMoveTo ? (
                <>
                  <p style={{
                    fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 400,
                    color: 'var(--text-primary)', lineHeight: 1.3, margin: '0 0 0.25rem',
                  }}>
                    Replace "{rankConflict.occupant.title}" at #{rankConflict.rank} with "{item.title}"?
                  </p>
                  <button
                    onClick={() => {
                      topLists.setSlot(topListType, rankConflict.rank, item);
                      setRankConflict(null);
                    }}
                    style={pillButtonStyle('solid')}
                  >
                    Replace
                  </button>
                  <button onClick={() => setPickingMoveTo(true)} style={pillButtonStyle('muted')}>
                    Move "{rankConflict.occupant.title}" to another spot first
                  </button>
                  <button onClick={() => { setRankConflict(null); setPickingMoveTo(false); }} style={pillButtonStyle('muted')}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p style={{
                    fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 400,
                    color: 'var(--text-primary)', lineHeight: 1.3, margin: '0 0 0.25rem',
                  }}>
                    Move "{rankConflict.occupant.title}" to which open spot?
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
                    {Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1)
                      .filter(r => r !== rankConflict.rank && !topItems.find(t => t.rank === r))
                      .map(r => (
                        <button
                          key={r}
                          onClick={async () => {
                            await topLists.setSlot(topListType, r, rankConflict.occupant);
                            await topLists.setSlot(topListType, rankConflict.rank, item);
                            setRankConflict(null);
                            setPickingMoveTo(false);
                          }}
                          style={{
                            padding: '0.5rem 0', minHeight: 40,
                            border: '1px solid var(--border)', borderRadius: 8,
                            background: 'transparent', color: 'var(--text-primary)',
                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                          }}
                        >
                          {r}
                        </button>
                      ))}
                  </div>
                  {Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1).filter(r => r !== rankConflict.rank && !topItems.find(t => t.rank === r)).length === 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No open spots. Every other rank is taken.</div>
                  )}
                  <button onClick={() => setPickingMoveTo(false)} style={pillButtonStyle('muted')}>
                    Back
                  </button>
                </>
              )}
            </div>
          </div>
        )}
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
            <>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="List name…"
                  value={creatingName}
                  disabled={isCreating}
                  onChange={e => {
                    setCreatingName(e.target.value);
                    if (createError) setCreateError('');
                  }}
                  onKeyDown={e => e.key === 'Enter' && !isCreating && handleCreate()}
                  autoFocus
                  style={{
                    flex: 1, padding: '0.4rem 0.6rem',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    background: 'var(--bg)', color: 'var(--text-primary)',
                    fontSize: '0.875rem', outline: 'none',
                  }}
                />
                <button className="btn btn-primary btn-xs" disabled={!creatingName.trim() || isCreating} onClick={handleCreate}>
                  {isCreating ? MEDIA_PANEL.creating : MEDIA_PANEL.create}
                </button>
                <button
                  className="icon-btn"
                  style={{ width: 32, height: 32 }}
                  disabled={isCreating}
                  aria-label="Cancel"
                  onClick={() => {
                    setShowCreate(false);
                    setCreateError('');
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              {createError && (
                <div style={{ padding: '0 1rem 0.75rem', color: 'var(--danger)', fontSize: '0.75rem' }}>
                  {createError}
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => {
                setShowCreate(true);
                setCreateError('');
              }}
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

export default function MediaPanel({ itemId, itemType, initialListOpen = false, closing, onClose }) {
  const { watchlist, watching, user, profile, favorites, customLists, openPanel } = useApp();
  const [talentId, setTalentId] = useState(null);
  const [talentPerson, setTalentPerson] = useState(null);
  const [talentCredits, setTalentCredits] = useState(null);
  const [talentError, setTalentError] = useState(false);

  // Breadcrumb trail of every view left behind while clicking through
  // title → cast → title → cast, so "back" always has somewhere to go.
  // Each entry is a full snapshot of what was on screen before that step.
  const [navStack, setNavStack] = useState([]);
  const skipNextResetRef = useRef(false);

  const goToTalent = (personId) => {
    setNavStack(stack => [...stack, { itemId, itemType, talentId }]);
    setTalentId(personId);
  };

  const goToTitle = (id, type, source) => {
    setNavStack(stack => [...stack, { itemId, itemType, talentId }]);
    skipNextResetRef.current = true;
    setTalentId(null);
    openPanel(id, type, source);
  };

  const goBack = () => {
    if (!navStack.length) return;
    const prev = navStack[navStack.length - 1];
    setNavStack(navStack.slice(0, -1));
    if (prev.itemId !== itemId || prev.itemType !== itemType) {
      skipNextResetRef.current = true;
      openPanel(prev.itemId, prev.itemType, 'panel_back');
    }
    setTalentId(prev.talentId);
  };

  // A title opened from *outside* this panel's own click-through chain (e.g. a
  // rail elsewhere in the app while this panel is still open) is a fresh start,
  // not a step in the trail — clear the trail and any cast member being viewed.
  useEffect(() => {
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }
    setNavStack([]);
    setTalentId(null);
  }, [itemId]);

  useEffect(() => {
    if (!talentId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale profile/credits before fetching the newly-selected cast member
    setTalentPerson(null);
    setTalentCredits(null);
    setTalentError(false);
    Promise.all([tmdb.getPersonDetails(talentId), tmdb.getPersonCredits(talentId)]).then(([person, work]) => {
      if (cancelled) return;
      if (!person || !work) { setTalentError(true); return; }
      setTalentPerson(person);
      setTalentCredits(work);
    }).catch(() => { if (!cancelled) setTalentError(true); });
    return () => { cancelled = true; };
  }, [talentId]);
  const timezone = profile?.timezone || null;
  const history = useHistory(user?.id);
  const { shareTitle, copied: shareCopied } = useShareTitle();

  const [details,      setDetails]      = useState(null);
  const [whereToWatch, setWhereToWatch] = useState({ streaming: [], rentBuy: [], inCinemas: false, justwatchLink: null, region: null });
  const [loading,      setLoading]      = useState(true);
  const [detailsError, setDetailsError] = useState(false);
  const [criticScore,    setCriticScore]    = useState(null);
  const [audienceQuote,  setAudienceQuote]  = useState(null);

  const [showListSheet,     setShowListSheet]     = useState(initialListOpen);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  // Where to watch opens closed — its logos say enough at a glance. The foot
  // bar owns its own open state, inside TakeBar.
  const [watchOpen, setWatchOpen] = useState(false);
  const [statusActionPending, setStatusActionPending] = useState('');
  const [statusActionError, setStatusActionError] = useState('');

  const isMovie    = itemType === 'movie';
  const inList     = watchlist.isInList(itemId);
  const isWatching = !isMovie && watching.isWatching(itemId);
  const progress   = watching.getProgress(itemId);
  const watched    = history.isWatched(itemId, itemType);
  const isFav        = favorites.isFavorite(itemId);
  const fw           = favoriteWords(profile?.region);
  const isInAnyList  = customLists?.lists?.some(list => customLists.isInList(list.id, itemId)) ?? false;
  const watchedEntry = history.entries.find(e => e.tmdb_id === Number(itemId) && e.media_type === itemType);
  // Date watched defaults to the date this title was added to Saved (not
  // today) — most titles are watched a while after being saved, and that's a
  // more honest default than "just now". Falls back to today if it was never
  // saved before being marked watched.
  const watchlistEntry   = watchlist.items?.find(i => i.tmdb_id === Number(itemId));
  const defaultWatchedAt = watchlistEntry?.created_at ? watchlistEntry.created_at.slice(0, 10) : localDateStr();
  const savedRating    = watchedEntry?.rating || 0;
  const savedReview    = watchedEntry?.note || '';
  const savedDnf       = !!watchedEntry?.dnf;
  // watched_at is timestamptz, so Postgres hands back "2026-06-10T00:00:00+00:00".
  // <input type="date"> only accepts yyyy-mm-dd and renders blank for anything
  // else, so it has to be sliced before it reaches the field.
  const savedWatchedAt = watchedEntry?.watched_at ? watchedEntry.watched_at.slice(0, 10) : defaultWatchedAt;
  const hasWatchedEntry = !!watchedEntry;

  /* TitleReview owns the form and its draft state; the panel keeps only the two
     write paths, because they are the part that has to go through `history`.
     Both resolve to a truthy row on success, which is what the child checks. */
  const saveReview = async ({ rating, note, dnf, watchedAt }) => {
    const written = hasWatchedEntry
      ? await history.updateEntry(itemId, {
          rating, note, dnf,
          watched_at: watchedAt || defaultWatchedAt,
        }, itemType)
      : await history.logWatched(
          { ...details, id: itemId, media_type: itemType },
          { rating, note, dnf, watchedAt: watchedAt || defaultWatchedAt },
        );
    return !!written;
  };

  /* Clears the rating and note but keeps the history row: you still watched it,
     you just don't want the write-up any more. Deleting the row is the Watched
     toggle's job, not this menu's. */
  const clearReview = async () =>
    !!await history.updateEntry(itemId, { rating: null, note: null }, itemType);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;

      const action = resolveMediaPanelEscapeAction({ closing, showListSheet });
      if (!action) return;

      event.preventDefault();
      if (action === 'close-list-sheet') {
        setShowListSheet(false);
        return;
      }

      if (navStack.length) {
        goBack();
        return;
      }

      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closing, onClose, showListSheet, navStack]); // eslint-disable-line react-hooks/exhaustive-deps -- goBack is a stable closure over local state, re-declaring it every render would thrash this listener

  // Swipe-down-to-close (mobile/tablet bottom sheet only)
  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef({ active: false, startY: 0, startTime: 0 });

  const isBottomSheet = () =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;

  const handleDragStart = useCallback((e) => {
    if (e.pointerType === 'mouse' || !isBottomSheet()) return;
    dragStateRef.current = { active: true, startY: e.clientY, startTime: Date.now() };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!dragStateRef.current.active) return;
    const delta = e.clientY - dragStateRef.current.startY;
    setDragY(delta > 0 ? delta : 0);
  }, []);

  const endDrag = useCallback(() => {
    if (!dragStateRef.current.active) return;
    const delta = dragY;
    const elapsed = Date.now() - dragStateRef.current.startTime;
    const velocity = delta / Math.max(elapsed, 1);
    dragStateRef.current.active = false;
    setDragY(0);
    if (delta > 120 || velocity > 0.5) onClose();
  }, [dragY, onClose]);

  const loadDetails = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setDetailsError(false);
    setCriticScore(null);
    setAudienceQuote(null);
    const region = getTmdbRegion();
    const [det, prov, verified] = await Promise.all([
      isMovie ? tmdb.getMovieDetails(itemId) : tmdb.getTVDetails(itemId),
      tmdb.getWatchProviders(itemId, itemType),
      fetchVerifiedAvailability({ tmdbId: itemId, mediaType: itemType, region }),
    ]);
    if (!det) {
      setDetailsError(true);
    } else {
      setDetails(det);
      const regionData = prov?.results?.[region] || {};
      const fallbackOffers = offersFromTmdb(regionData);
      const offers = verified?.offers?.length ? verified.offers.map((offer) => ({
        ...offer,
        offerType: { flatrate: 'Subscription', rent: 'Rent', buy: 'Buy', free: 'Free', ads: 'Free with ads' }[offer.offerType] || offer.offerType,
      })) : fallbackOffers;
      const streaming = offers.filter((offer) => ['Subscription', 'Free', 'Free with ads'].includes(offer.offerType));
      const rentBuy = offers.filter((offer) => ['Rent', 'Buy'].includes(offer.offerType));
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
      setWhereToWatch({
        streaming,
        rentBuy,
        inCinemas,
        justwatchLink: verified?.title_url || regionData.link || null,
        region,
      });
      // Critic score + audience quote depend on the imdb_id this same call just
      // returned, so they can't join the Promise.all above. Fire-and-forget
      // rather than block the panel on a third-party lookup.
      const imdbId = det.external_ids?.imdb_id;
      if (imdbId) fetchCriticScore(imdbId).then(setCriticScore);
      tmdb.getReviews(itemType, itemId).then((reviews) => setAudienceQuote(pickAudienceQuote(reviews)));
    }
    setLoading(false);
  }, [itemId, itemType, isMovie]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- details loading is encapsulated in the stable callback
  useEffect(() => { loadDetails(); }, [loadDetails]);

  const title   = details?.title || details?.name || '';
  const date    = details?.release_date || details?.first_air_date;
  const chip    = date ? countdownChip(date) : null;
  const cast = (details?.credits?.cast || details?.aggregate_credits?.cast || []).slice(0, 12);
  const similar = recommendationsFromDetails(details);

  const audienceScore = audienceScoreFromDetails(details);
  const consensusLine = criticScore
    ? getConsensusLine(criticScore.criticScore, audienceScore, { audienceVoteCount: details?.vote_count, seed: details?.id })
    : null;
  const hasWatchOffers = whereToWatch.streaming.length > 0 || whereToWatch.rentBuy.length > 0 || whereToWatch.inCinemas;
  const watchNetworks = isMovie ? [] : networksFromDetails(details);

  // ── What this is, in one line under the title ──
  // Year and length for a film, year and season count for a series; the person
  // behind it goes on the line below rather than being squeezed in beside them.
  const year = date ? new Date(date).getFullYear() : '';
  const runtimeText = isMovie
    ? (details?.runtime
        ? (details.runtime >= 60
            ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
            : `${details.runtime}m`)
        : '')
    : (details?.number_of_seasons
        ? `${details.number_of_seasons} season${details.number_of_seasons > 1 ? 's' : ''}`
        : '');
  const factLine = [year, runtimeText].filter(Boolean).join(' · ');
  const author = isMovie
    ? (details?.credits?.crew || []).find(c => c.job === 'Director')?.name
    : (details?.created_by || [])[0]?.name;
  const genreChips = (details?.genres || []).slice(0, 2);

  // ── The logos the collapsed Where to watch card shows in place of its rows ──
  // With no offers anywhere it falls back to the networks, so the card still
  // answers "who has this" at a glance instead of collapsing to a bare heading.
  const stackProviders = (hasWatchOffers
    ? [...whereToWatch.streaming, ...whereToWatch.rentBuy]
    : watchNetworks
  ).filter((p, i, all) => all.findIndex(o => o.providerId === p.providerId) === i);
  const stackShown = stackProviders.slice(0, 3);
  const stackExtra = stackProviders.length - stackShown.length;


  const runStatusAction = useCallback(async (actionLabel, action) => {
    if (statusActionPending) return;
    setStatusActionPending(actionLabel);
    setStatusActionError('');
    try {
      const result = await action();
      if (!result?.ok) {
        setStatusActionError(result?.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
      }
    } finally {
      setStatusActionPending('');
      setShowStatusDropdown(false);
    }
  }, [statusActionPending]);

  const handleWatchingStatus = useCallback(async () => {
    if (isWatching) {
      const stopped = await watching.stopWatching(itemId);
      return stopped
        ? { ok: true }
        : { ok: false, error: 'Could not clear the active watching state. Please try again.' };
    }

    return moveSavedShowToWatching({
      startWatching: () => watching.startWatching({ ...details, id: itemId, media_type: 'tv' }),
      removeFromSaved: () => inList ? watchlist.removeFromList(itemId) : Promise.resolve(true),
      rollbackWatching: () => watching.stopWatching(itemId),
    });
  }, [details, inList, isWatching, itemId, watchlist, watching]);

  const handleWatchedStatus = useCallback(async (dnf) => {
    const isSameWatchedState = watched && (!!watchedEntry?.dnf === dnf);
    if (isSameWatchedState) {
      const removed = await history.removeEntry(itemId, itemType);
      return removed
        ? { ok: true }
        : { ok: false, error: MEDIA_PANEL.couldNotClearWatchStatus };
    }

    const result = await markMediaAsWatched({
      logWatched: () => history.logWatched(
        { ...details, id: itemId, media_type: itemType, dnf },
        { watchedAt: defaultWatchedAt },
      ),
      clearWatching: () => watching.stopWatching(itemId),
      removeFromSaved: () => watchlist.removeFromList(itemId),
      rollbackHistory: () => history.removeEntry(itemId, itemType),
      mediaType: itemType,
      isWatching,
      inList,
    });
    // The driver's message is diagnostic but not English — a network drop
    // reached the banner as "TypeError: Failed to fetch". Report it instead of
    // displaying it: PostHog gets the real cause on every occurrence, which is
    // strictly better than the screenshot this used to depend on, and the user
    // gets the sentence the catalog already has.
    const realError = !result.ok && history.getLastError();
    if (realError) {
      captureException(new Error(realError), { surface: 'media_panel', action: 'watched_status' });
    }
    return result;
  }, [defaultWatchedAt, details, history, inList, isWatching, itemId, itemType, watched, watchedEntry?.dnf, watchlist, watching]);

  /* Watching the final episode of a finished series completes it. Reuses the
     same transition as the Watched status action, so a show finished by
     ticking episodes ends up in exactly the state as one marked watched by
     hand. Already-watched shows are a no-op rather than a toggle-off, since
     this fires from episode ticks, not from a button the user aimed at it. */
  const handleSeriesFinished = useCallback(async () => {
    if (watched) return { ok: true };
    return handleWatchedStatus(false);
  }, [handleWatchedStatus, watched]);

  const handleClearStatus = useCallback(async () => {
    if (isWatching) {
      const stopped = await watching.stopWatching(itemId);
      return stopped
        ? { ok: true }
        : { ok: false, error: MEDIA_PANEL.couldNotClearWatchStatus };
    }
    if (watched) {
      const removed = await history.removeEntry(itemId, itemType);
      return removed
        ? { ok: true }
        : { ok: false, error: MEDIA_PANEL.couldNotClearWatchStatus };
    }
    return { ok: true };
  }, [history, isWatching, itemId, itemType, watched, watching]);

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
      <div
        className={`panel${closing ? ' closing' : ''}`}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        {navStack.length > 0 ? (
          /* Every step deeper than the title you first opened — cast → title →
             cast → title, etc. — gets this plain back/close bar rather than a
             hero image, so there's always a way back up the trail. A portrait
             stretched into the 16:9 backdrop crop also zooms in on the face
             awkwardly, which this sidesteps entirely. */
          <div className="panel-toolbar">
            <button className="panel-toolbar-btn" onClick={goBack} aria-label="Back">
              <BackIcon />
            </button>
            <button className="panel-toolbar-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        ) : (
          <div className={`panel-header-wrap${details?.backdrop_path ? '' : ' panel-header-wrap--no-backdrop'}`}>
            <div
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {details?.backdrop_path
                ? <img className="panel-header-img" src={backdropUrl(details.backdrop_path)} alt="" />
                : <div className="panel-header-fallback" />
              }
              <div className="panel-drag-handle" />
            </div>
            <button className="panel-close-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        )}

        {talentId ? (
          <div className="panel-body">
            <TalentPanelView person={talentPerson} credits={talentCredits} error={talentError} onOpenTitle={goToTitle} />
          </div>
        ) : loading ? (
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
            {/* ── Head ──
                The cover is a band rather than a full 16:9 hero, and the poster
                overlaps it, so what this is — kind, title, year, length, who
                made it, genre — is all above the fold instead of below a
                half-panel of artwork. ── */}
            <div className="panel-head">
              {details?.poster_path
                ? <img className="panel-poster" src={posterUrl(details.poster_path, 'w342')} alt="" />
                : <div className="panel-poster panel-poster--empty" aria-hidden="true" />
              }
              <div className="panel-head-text">
                <div className="panel-kicker">{isMovie ? MEDIA.movie : MEDIA.series}</div>
                <h2 className="panel-title">{title}</h2>
                <p className="panel-facts">
                  {factLine}
                  {author && <><br />{author}</>}
                </p>
                {(genreChips.length > 0 || (chip && chip.cls !== 'chip-muted')) && (
                  <div className="panel-genres">
                    {chip && chip.cls !== 'chip-muted' && <span className={`chip ${chip.cls}`}>{chip.label}</span>}
                    {genreChips.map(g => <span className="panel-genre" key={g.id}>{g.name}</span>)}
                  </div>
                )}
              </div>
            </div>

            {/* ── Actions ──
                The two that carry state keep their labels; favourite, list and
                share are icons. Every one is sized to itself rather than
                stretched to a share of the panel, so the row reads as controls
                rather than as a wall. ── */}
            <div className="panel-actions-row">
              <button
                className={`panel-pill${inList ? ' panel-pill--saved' : ' panel-pill--primary'}`}
                onClick={() => watchlist.toggle({ ...details, id: itemId, media_type: itemType })}
              >
                {inList ? <CheckIcon /> : <BookmarkIcon />}
                {inList ? MEDIA_PANEL.inWatchlist : MEDIA_PANEL.addToWatchlist}
              </button>

              <div className="panel-status" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setShowStatusDropdown(false); }}>
                <button
                  className={`panel-pill panel-pill--status${isWatching ? ' panel-pill--watching' : watched ? ' panel-pill--watched' : ''}`}
                  onClick={() => setShowStatusDropdown(v => !v)}
                  disabled={!!statusActionPending}
                  aria-haspopup="menu"
                  aria-expanded={showStatusDropdown}
                >
                  <StatusIcon size={15} />
                  <span className="panel-pill-label">
                    {statusActionPending ? statusActionPending
                      : isWatching ? MEDIA_PANEL.watching
                      : watched && watchedEntry?.dnf ? MEDIA_PANEL.didntFinish
                      : watched ? MEDIA.watched
                      : MEDIA_PANEL.status}
                  </span>
                </button>
                {showStatusDropdown && (
                  <div className="panel-status-menu">
                    {[
                      { label: MEDIA_PANEL.watching, action: () => runStatusAction(MEDIA_PANEL.updating, handleWatchingStatus), hidden: isMovie },
                      { label: MEDIA.watched, action: () => runStatusAction(MEDIA_PANEL.updating, () => handleWatchedStatus(false)) },
                      { label: MEDIA_PANEL.didntFinish, action: () => runStatusAction(MEDIA_PANEL.updating, () => handleWatchedStatus(true)) },
                      { label: MEDIA_PANEL.clearStatus, action: () => runStatusAction(MEDIA_PANEL.clearing, handleClearStatus), hidden: !(isWatching || watched), muted: true },
                    ].filter(o => !o.hidden).map(opt => (
                      <button
                        key={opt.label}
                        className={`panel-status-option${opt.muted ? ' panel-status-option--muted' : ''}`}
                        onClick={opt.action}
                        disabled={!!statusActionPending}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-icon-group">
              <button
                className={`panel-icon-btn${isFav ? ' panel-icon-btn--fav' : ''}`}
                onClick={() => favorites.toggleFavorite({ ...details, id: itemId, media_type: itemType })}
                aria-label={isFav ? fw.pastTitle : fw.noun}
                aria-pressed={isFav}
              >
                <HeartIcon filled={isFav} size={17} />
              </button>
              <button
                className={`panel-icon-btn${isInAnyList ? ' panel-icon-btn--on' : ''}`}
                onClick={() => setShowListSheet(true)}
                aria-label={isInAnyList ? MEDIA_PANEL.onList : MEDIA_PANEL.list}
              >
                <ListIcon size={17} />
              </button>
              <button
                className={`panel-icon-btn${shareCopied ? ' panel-icon-btn--fav' : ''}`}
                onClick={() => shareTitle({ tmdbId: itemId, mediaType: itemType, title })}
                aria-label={shareCopied ? COMMON.copied : COMMON.share}
              >
                <ShareIcon size={17} />
              </button>
              </div>
            </div>

            {statusActionError && (
              <div className="panel-status-error" role="alert">{statusActionError}</div>
            )}

            {!isMovie && isWatching && details && (
              <UpNextCard
                tvId={itemId}
                details={details}
                progress={progress}
                whereToWatch={whereToWatch}
                onSeriesFinished={handleSeriesFinished}
              />
            )}

            {/* ── Where to watch ──
                First, because it is what the panel is for, and collapsed to its
                provider logos, because that answers the question at a glance.
                Everything it used to sit under — the overview, the cast, the
                trailer, the episode guide — now sits under it. ── */}
            {details && (
              <section className="panel-card panel-watch">
                <button
                  type="button"
                  className="panel-disclosure"
                  aria-expanded={watchOpen}
                  onClick={() => setWatchOpen(v => !v)}
                >
                  <h3 className="panel-card-title">{MEDIA_PANEL.whereToWatch}</h3>
                  {!watchOpen && stackShown.length > 0 && (
                    <span className="panel-logo-stack" aria-hidden="true">
                      {stackShown.map(p => (
                        <img
                          key={p.providerId}
                          src={p.logoPath?.startsWith('http') ? p.logoPath : logoUrl(p.logoPath, 'w45')}
                          alt=""
                        />
                      ))}
                      {stackExtra > 0 && <span className="panel-logo-more">{MEDIA_PANEL.moreProviders(stackExtra)}</span>}
                    </span>
                  )}
                  <ChevronIcon />
                </button>

                {watchOpen && (
                  <div className="panel-watch-body">
                    {hasWatchOffers && (
                      <div className="panel-watch-region">
                        <span>
                          {whereToWatch.region && regionDisplayName(whereToWatch.region)
                            ? MEDIA_PANEL.offersIn(regionDisplayName(whereToWatch.region))
                            : ''}
                        </span>
                      </div>
                    )}
                    {whereToWatch.inCinemas && (
                      <div className="providers-grid">
                        <div className="provider-chip provider-chip--cinema">In Cinemas</div>
                      </div>
                    )}
                    {whereToWatch.streaming.length > 0 && (
                      <div className="providers-grid">
                        {whereToWatch.streaming.map(p => (
                          <ProviderChip
                            key={`${p.providerId}-${p.offerType}`}
                            provider={p}
                            mediaType={itemType}
                            tmdbId={itemId}
                            region={whereToWatch.region}
                            justwatchLink={whereToWatch.justwatchLink}
                          />
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
                            <ProviderChip
                              key={`${p.providerId}-${p.offerType}`}
                              provider={p}
                              mediaType={itemType}
                              tmdbId={itemId}
                              region={whereToWatch.region}
                              justwatchLink={whereToWatch.justwatchLink}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    {!hasWatchOffers && (
                      <>
                        {/* Nothing to buy or stream yet, so the network is a
                            mark rather than an offer: the logo alone, in the
                            same circle the collapsed card stacks. */}
                        {watchNetworks.length > 0 && (
                          <div className="panel-network-row">
                            {watchNetworks.map(network => (
                              <img
                                key={network.providerId}
                                className="panel-network-logo"
                                src={network.logoPath?.startsWith('http') ? network.logoPath : logoUrl(network.logoPath, 'w45')}
                                alt={network.providerName}
                                title={network.providerName}
                              />
                            ))}
                          </div>
                        )}
                        <p className="providers-empty">
                          {whereToWatch.region && regionDisplayName(whereToWatch.region)
                            ? `Not streaming in ${regionDisplayName(whereToWatch.region)} yet.`
                            : 'Not streaming anywhere yet.'}
                          {whereToWatch.justwatchLink && (
                            <> <a href={whereToWatch.justwatchLink} target="_blank" rel="noopener">Check JustWatch</a></>
                          )}
                        </p>
                      </>
                    )}
                    {hasWatchOffers && (
                      <p className="providers-attribution">
                        Streaming availability by JustWatch.
                        {[...whereToWatch.streaming, ...whereToWatch.rentBuy].some(p =>
                          buildWatchLink({
                            providerUrl: p.providerUrl,
                            justwatchLink: whereToWatch.justwatchLink,
                          })?.kind === 'provider'
                        ) && ' Links open the verified title offer.'}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── What everyone else thought ──
                The two numbers read as a pair, with a real audience review in
                the space beside them rather than a consensus sentence on its
                own line. ── */}
            {(criticScore || Number.isFinite(audienceScore)) && (
              <div className="panel-scores">
                {criticScore && (
                  <div className="panel-score">
                    <b>{criticScore.criticScore}%</b>
                    <span>{MEDIA_PANEL.critics}</span>
                  </div>
                )}
                {criticScore && Number.isFinite(audienceScore) && <span className="panel-score-rule" />}
                {Number.isFinite(audienceScore) && (
                  <div className="panel-score">
                    <b>{audienceScore}%</b>
                    <span>{MEDIA_PANEL.audience}</span>
                  </div>
                )}
                {audienceQuote ? (
                  <blockquote className="panel-quote">
                    <p>&ldquo;{audienceQuote.text}&rdquo;</p>
                    <cite>{audienceQuote.author || 'A TMDB audience review'}</cite>
                  </blockquote>
                ) : consensusLine ? (
                  <p className="panel-consensus">{consensusLine}</p>
                ) : null}
              </div>
            )}

            {/* Overview */}
            {details?.overview && (
              <p className="panel-overview">{details.overview}</p>
            )}


            {cast.length > 0 && (
              <section className="panel-cast-section" aria-labelledby="panel-cast-title">
                <div className="panel-section-title" id="panel-cast-title">Cast</div>
                <div className="panel-cast-rail">
                  {cast.map(person => {
                    const image = profileUrl(person.profile_path);
                    return (
                      <button
                        type="button"
                        className="panel-cast-card"
                        key={person.id}
                        onClick={() => goToTalent(person.id)}
                        aria-label={`View ${person.name}`}
                      >
                        {image
                          ? <img src={image} alt="" loading="lazy" />
                          : <span className="panel-cast-fallback" aria-hidden="true">{person.name?.charAt(0)}</span>
                        }
                        <span className="panel-cast-name">{person.name}</span>
                        {(person.character || person.roles?.[0]?.character) && (
                          <span className="panel-cast-role">{person.character || person.roles[0].character}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
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
                    title={trailer.name || MEDIA_PANEL.trailerFallback}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              );
            })()}

            {/* Episode guide for TV. Where to watch now leads the panel, so this
                sits with the rest of the title's detail. */}
            {!isMovie && details && (
              <>
                <div className="panel-section-title">Episodes</div>
                <EpisodeGuide
                  tvId={itemId}
                  currentProgress={progress}
                  details={details}
                  timezone={timezone}
                  onSeriesFinished={handleSeriesFinished}
                />
              </>
            )}

            {/* Recommendations and the franchise card close the panel: everything
                above is about this title, these are where to go next. */}
            {similar.length > 0 && (
              <section className="panel-similar-section" aria-labelledby="panel-similar-title">
                <div className="panel-section-title" id="panel-similar-title">{MEDIA_PANEL.moreLikeThis}</div>
                <div className="panel-similar-rail">
                  {similar.map(item => {
                    const type = mediaType(item);
                    const title = creditTitle(item);
                    return (
                      <button
                        type="button"
                        className="panel-similar-card"
                        key={`${type}-${item.id}`}
                        onClick={() => goToTitle(item.id, type, 'more_like_this')}
                        aria-label={title}
                      >
                        <img src={posterUrl(item.poster_path, 'w185')} alt="" loading="lazy" />
                        <span className="panel-similar-name">{title}</span>
                        <span className="panel-similar-meta">{creditMeta(item, type)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {isMovie && details && (
              <CollectionCard details={details} itemId={itemId} history={history} onOpenTitle={goToTitle} />
            )}
          </div>
        )}

        {!talentId && !loading && !detailsError && details && (
          <TakeBar
            key={`${itemType}:${itemId}`}
            itemId={itemId}
            itemType={itemType}
            title={title}
            watched={watched}
            watchedEntry={watchedEntry}
            rating={savedRating}
            note={savedReview}
            dnf={savedDnf}
            watchedAt={savedWatchedAt}
            onSave={saveReview}
            onClear={clearReview}
            user={user}
          />
        )}
      </div>
    </>
  );
}

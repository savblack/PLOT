// Dismissible card at the top of Home, after onboarding. The rules live in
// @plot/core/firstWinCard.js. This file is the web render. It does not block
// the rest of Home.
// Mobile: apps/mobile/components/FirstWinCard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { firstHomeTitle, firstWinCardVisible } from '@plot/core/firstWinCard.js';
import { logLastEpisodeSeen } from '@plot/core/watchingProgress.js';
import { markMediaAsWatched } from '@plot/core/mediaStatus.js';
import { useTvSeasonBrowser } from '@plot/core/useTvSeasonBrowser.js';
import { ONBOARDING_FLOW as F } from '../copy/onboardingFlow.js';
import { COMMON } from '../copy/common.js';
import { MEDIA } from '../copy/media.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { useHistory } from '@plot/core/useHistory.js';
import { useApp } from '../hooks/useApp.js';
import { posterUrl } from '../utils/images.js';
import { dismissFirstWinFor, readFirstWinCard } from '../utils/firstWinCardState.js';
import './FirstWinCard.css';

export default function FirstWinCard() {
  const { user, watchlist, watching } = useApp();
  const history = useHistory(user?.id);
  const [state, setState] = useState(() => readFirstWinCard(user?.id));
  const title = firstHomeTitle(watchlist?.items);
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const browser = useTvSeasonBrowser(open && title?.media_type === 'tv' ? title.id : null);
  const navigate = useNavigate();

  if (!user || !firstWinCardVisible(state)) return null;

  const dismiss = () => setState(dismissFirstWinFor(user.id));

  const markMovie = async () => {
    if (!title || busy) return;
    setBusy(true);
    setError('');
    const result = await markMediaAsWatched({
      logWatched: () => history.logWatched({ ...title, media_type: 'movie' }),
      clearWatching: async () => true,
      removeFromSaved: () => watchlist.removeFromList(title.id),
      rollbackHistory: () => history.removeEntry(title.id, 'movie'),
      mediaType: 'movie',
      isWatching: false,
      inList: watchlist.isInList(title.id),
    });
    setBusy(false);
    if (!result.ok) setError(MEDIA_PANEL.couldNotUpdateWatchStatus);
    else setLogged(true);
  };

  const onAction = () => {
    if (!title) return;
    if (title.media_type === 'tv') { setError(''); setOpen(on => !on); return; }
    markMovie();
  };

  const tick = async (episodeNumber) => {
    if (!title || !browser.episodes?.length || busy) return;
    const episodeCount = browser.episodes.reduce((max, ep) => Math.max(max, ep.episode_number), episodeNumber);
    setBusy(true);
    setError('');
    const result = await logLastEpisodeSeen({
      startWatching: watching.startWatching,
      setProgress: watching.setProgress,
      show: { ...title, name: title.title },
      season: browser.season,
      episodeNumber,
      episodeCount,
    });
    setBusy(false);
    if (!result.ok) setError(MEDIA_PANEL.couldNotUpdateWatchStatus);
    else { setLogged(true); setOpen(false); }
  };

  return (
    <FirstWinCardView
      title={title}
      logged={logged}
      busy={busy}
      open={open}
      error={error}
      seasons={browser.seasons}
      season={browser.season}
      episodes={browser.episodes}
      loading={browser.loading}
      loadFailed={browser.failed}
      onSkip={dismiss}
      onAction={onAction}
      onSeason={browser.setSeason}
      onEpisode={tick}
      onTonight={() => navigate('/tonight')}
    />
  );
}

/**
 * Render only, so Storybook can show the card without an account.
 * @param {{
 *   title: { id: number, media_type: string, title: string, poster_path?: string | null } | null,
 *   logged: boolean, busy: boolean, open: boolean, error: string,
 *   seasons: number[] | null, season: number,
 *   episodes: Array<{ episode_number: number, name: string }> | null,
 *   loading: boolean, loadFailed: boolean,
 *   onSkip: () => void, onAction: () => void, onSeason: (n: number) => void,
 *   onEpisode: (n: number) => void, onTonight: () => void,
 * }} props
 */
export function FirstWinCardView({
  title, logged, busy, open, error, seasons, season, episodes, loading, loadFailed,
  onSkip, onAction, onSeason, onEpisode, onTonight,
}) {
  const show = title?.media_type === 'tv';
  return (
    <section className="fw-card" aria-label={F.firstWin.title}>
      <div className="fw-head">
        <h2 className="fw-title">{F.firstWin.title}</h2>
        <button type="button" className="fw-skip" onClick={onSkip}>{F.skip}</button>
      </div>
      {!title && <p className="fw-empty">{F.firstWin.empty}</p>}
      {title && (
        <div className="fw-row">
          {title.poster_path
            ? <img className="fw-poster" src={posterUrl(title.poster_path, 'w185')} alt="" />
            : <span className="fw-poster" />}
          <span className="fw-name">{title.title}</span>
          {logged
            ? <span className="fw-logged">{F.firstWin.logged}</span>
            : (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onAction}>
                {busy ? COMMON.saving : show ? F.firstWin.tickEpisode : MEDIA.markWatched}
              </button>
            )}
        </div>
      )}
      {open && show && (
        <>
          <p className="fw-empty">{F.firstWin.sheetSub(title.title)}</p>
          {seasons && seasons.length > 1 && (
            <label className="fw-season">
              {MEDIA_PANEL.chooseSeason}
              <select value={season} onChange={e => onSeason(Number(e.target.value))}>
                {seasons.map(n => <option key={n} value={n}>{MEDIA_PANEL.seasonLabel(n)}</option>)}
              </select>
            </label>
          )}
          {loading && <p className="fw-empty">{COMMON.loading}</p>}
          {loadFailed && <p className="fw-error">{MEDIA_PANEL.episodesLoadError}</p>}
          {!loading && !loadFailed && episodes && episodes.length === 0 && (
            <p className="fw-empty">{MEDIA_PANEL.noEpisodesAvailable}</p>
          )}
          {episodes && episodes.length > 0 && (
            <div className="fw-eps">
              {episodes.map(ep => (
                <button
                  key={ep.episode_number}
                  type="button"
                  className="fw-ep"
                  disabled={busy}
                  aria-label={F.firstWin.tickLabel(ep.episode_number, ep.name)}
                  onClick={() => onEpisode(ep.episode_number)}
                >
                  <span className="fw-ep-num">{ep.episode_number}</span>
                  <span>{ep.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p className="fw-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-secondary btn-sm" onClick={onTonight}>{F.firstWin.tonight}</button>
    </section>
  );
}

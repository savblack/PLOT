import { Fragment, useCallback, useState } from 'react';
import {
  episodeAt,
  episodeRatingSeasonNumbers,
  episodeRatingStory,
  episodeRatingSummary,
  episodeRowCount,
  formatEpisodeScore,
  formatVoteCount,
  gridForSource,
  ratingBand,
} from '@plot/core/episodeRatings.js';
import { useEpisodeRatings } from '@plot/core/useEpisodeRatings.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { useApp } from '../hooks/useApp.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import Spinner from './Spinner.jsx';
import './EpisodeRatingsSheet.css';

const BANDS = [
  ['peak', MEDIA_PANEL.episodeRatingsBandPeak],
  ['good', MEDIA_PANEL.episodeRatingsBandGood],
  ['fine', MEDIA_PANEL.episodeRatingsBandFine],
  ['soft', MEDIA_PANEL.episodeRatingsBandSoft],
  ['fall', MEDIA_PANEL.episodeRatingsBandFall],
];

function EpisodeRatingsSheet({ tvId, details, onClose }) {
  const app = useApp();
  const userId = app?.user?.id ?? null;
  const data = useEpisodeRatings({ tvId, details, userId, enabled: true });
  const [source, setSource] = useState('tmdb');
  const [picked, setPicked] = useState(null);

  const ready = data.status === 'ready';
  const grid = gridForSource(data.grid, data.yours, source);
  const story = episodeRatingStory(grid);
  const summary = episodeRatingSummary(story, source);
  const signedOutYours = source === 'yours' && !userId;
  const showGrid = ready && !signedOutYours && story.kind !== 'empty';
  const chosen = picked && episodeAt(grid, picked.seasonNumber, picked.episodeNumber)
    ? picked
    : story.low;
  const selected = showGrid && chosen
    ? episodeAt(grid, chosen.seasonNumber, chosen.episodeNumber)
    : null;
  const rows = episodeRowCount(grid);
  const votes = selected && source === 'tmdb' ? formatVoteCount(selected.voteCount) : '';

  let message = null;
  if (data.status === 'error') message = MEDIA_PANEL.episodeRatingsLoadError;
  else if (ready && signedOutYours) message = MEDIA_PANEL.episodeRatingsSignIn;
  else if (ready && story.kind === 'empty') {
    message = source === 'yours' ? MEDIA_PANEL.episodeRatingsNoneYours : MEDIA_PANEL.episodeRatingsNoneTmdb;
  }

  const footer = selected ? (
    <div className="er-detail">
      <div className="er-detail-copy">
        <div className="er-detail-id">{MEDIA_PANEL.seasonEpisode(chosen.seasonNumber, chosen.episodeNumber)}</div>
        <div className="er-detail-name">{selected.name || MEDIA_PANEL.episodeRatingsEpisode(selected.episodeNumber)}</div>
        {votes ? <div className="er-detail-votes">{MEDIA_PANEL.episodeRatingsVotes(votes)}</div> : null}
      </div>
      <div className={`er-detail-score${selected.score == null ? ' is-unrated' : ''}`}>
        {selected.score == null ? MEDIA_PANEL.episodeRatingsUnrated : formatEpisodeScore(selected.score, source)}
      </div>
    </div>
  ) : null;

  return (
    <ResponsiveDialog title={MEDIA_PANEL.episodeRatingsTitle} onClose={onClose} size="wide" tall footer={footer}>
      <div className="er-body">
        {data.status === 'loading' || data.status === 'idle' ? (
          <div className="er-loading"><Spinner size="md" label={MEDIA_PANEL.episodeRatingsTitle} /></div>
        ) : (
          <>
            <div className="er-sources" role="group" aria-label={MEDIA_PANEL.episodeRatingsTitle}>
              {[['tmdb', MEDIA_PANEL.episodeRatingsTmdb], ['yours', MEDIA_PANEL.episodeRatingsYours]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="er-source"
                  aria-pressed={source === id}
                  onClick={() => setSource(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {message && (
              <div className="er-message">
                <p>{message}</p>
                {data.status === 'error' && (
                  <button type="button" className="episode-ratings-open" onClick={data.reload}>
                    {MEDIA_PANEL.episodeRatingsRetry}
                  </button>
                )}
              </div>
            )}
            {showGrid && (
              <>
                <p className="er-story" aria-live="polite">{summary.story}</p>
                {summary.rated && <p className="er-rated">{summary.rated}</p>}
                <div className="er-legend">
                  {BANDS.map(([band, label]) => (
                    <span key={band}><span className={`er-swatch er-cell--${band}`} aria-hidden="true" />{label}</span>
                  ))}
                </div>
                <div className="er-scroll">
                  <div className="er-grid" style={{ '--cols': grid.length }}>
                    <div className="er-corner" />
                    {grid.map(season => (
                      <div key={season.seasonNumber} className="er-head">{`S${season.seasonNumber}`}</div>
                    ))}
                    {Array.from({ length: rows }, (_, index) => {
                      const episodeNumber = index + 1;
                      return (
                        <Fragment key={episodeNumber}>
                          <div className="er-label">{`E${episodeNumber}`}</div>
                          {grid.map(season => {
                            const episode = season.episodes.find(item => item.episodeNumber === episodeNumber);
                            if (!episode) return <div key={`${season.seasonNumber}-${episodeNumber}`} className="er-gap" />;
                            const band = ratingBand(episode.score);
                            const on = chosen?.seasonNumber === season.seasonNumber && chosen?.episodeNumber === episodeNumber;
                            const score = episode.score == null ? '' : formatEpisodeScore(episode.score, source);
                            const name = episode.name || MEDIA_PANEL.episodeRatingsEpisode(episodeNumber);
                            return (
                              <button
                                key={`${season.seasonNumber}-${episodeNumber}`}
                                type="button"
                                className={`er-cell er-cell--${band}${on ? ' is-selected' : ''}`}
                                aria-pressed={on}
                                aria-label={MEDIA_PANEL.episodeRatingsCell(
                                  season.seasonNumber,
                                  episodeNumber,
                                  name,
                                  score || MEDIA_PANEL.episodeRatingsUnrated,
                                )}
                                onClick={() => setPicked({ seasonNumber: season.seasonNumber, episodeNumber })}
                              >
                                {score}
                              </button>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

export default function EpisodeRatingsEntry({ tvId, details }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (episodeRatingSeasonNumbers(details).length === 0) return null;
  return (
    <>
      <button type="button" className="episode-ratings-open" onClick={() => setOpen(true)}>
        {MEDIA_PANEL.episodeRatingsTitle}
      </button>
      {open && <EpisodeRatingsSheet tvId={tvId} details={details} onClose={close} />}
    </>
  );
}

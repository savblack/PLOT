import { useState } from 'react';
import { ratingFromPointer, starFillPercent, STAR_COUNT } from '../utils/ratings.js';
import { ENGAGEMENT_PROMPT } from '../copy/engagementPrompt.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import StarIcon from './StarIcon.jsx';

/**
 * Compact sticky foot prompt for the title panel (PLO-473 / PLO-474).
 * One horizontal row: question on the left, actions on the right. Non-blocking.
 *
 * @param {'watch' | 'rate'} props.mode
 * @param {boolean} props.isTv
 * @param {boolean} [props.showWatchingCta]
 * @param {boolean} [props.busy]
 * @param {() => void} props.onMarkWatched
 * @param {() => void} [props.onStartWatching]
 * @param {() => void} props.onDismissWatch
 * @param {(rating: number) => void} props.onRate
 * @param {() => void} props.onWriteReview
 * @param {() => void} props.onSkipRate
 */
export default function EngagementPromptBar({
  mode,
  isTv,
  showWatchingCta = false,
  busy = false,
  onMarkWatched,
  onStartWatching,
  onDismissWatch,
  onRate,
  onWriteReview,
  onSkipRate,
}) {
  const [draftRating, setDraftRating] = useState(0);
  const [savingRate, setSavingRate] = useState(false);

  if (mode === 'rate') {
    const submit = async (value) => {
      if (!value || savingRate || busy) return;
      setSavingRate(true);
      try {
        await onRate(value);
      } finally {
        setSavingRate(false);
      }
    };

    return (
      <div className="panel-engagement" role="region" aria-label={ENGAGEMENT_PROMPT.howWasIt}>
        <b className="panel-engagement-label">{ENGAGEMENT_PROMPT.howWasIt}</b>
        <div className="panel-engagement-actions">
          <div className="panel-engagement-stars" role="group" aria-label={ENGAGEMENT_PROMPT.howWasIt}>
            {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className="panel-engagement-star"
                disabled={busy || savingRate}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                onClick={(event) => {
                  const value = ratingFromPointer(event, n);
                  setDraftRating(value);
                  submit(value);
                }}
              >
                <StarIcon fillPercent={starFillPercent(draftRating, n)} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || savingRate}
            onClick={onWriteReview}
          >
            {MEDIA_PANEL.writeReview}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || savingRate}
            onClick={onSkipRate}
          >
            {ENGAGEMENT_PROMPT.skipForNow}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-engagement" role="region" aria-label={ENGAGEMENT_PROMPT.watchedIt}>
      <b className="panel-engagement-label">{ENGAGEMENT_PROMPT.watchedIt}</b>
      <div className="panel-engagement-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={onMarkWatched}
        >
          {ENGAGEMENT_PROMPT.markAsWatched}
        </button>
        {isTv && showWatchingCta && onStartWatching && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onStartWatching}
          >
            {ENGAGEMENT_PROMPT.imWatching}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onDismissWatch}
        >
          {ENGAGEMENT_PROMPT.notYet}
        </button>
      </div>
    </div>
  );
}

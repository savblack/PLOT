import { useState } from 'react';
import { formatWatchedOn } from '@plot/core/date.js';
import { localDateStr } from '../utils/date.js';
import { ratingFromPointer, ratingToStars, starFillPercent, STAR_COUNT } from '../utils/ratings.js';
import { COMMON } from '../copy/common.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import KebabMenu from './KebabMenu.jsx';
import Spinner from './Spinner.jsx';
import StarIcon from './StarIcon.jsx';

const REVIEW_MAX = 280;

function PencilIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>
    </svg>
  );
}

/**
 * Your own rating and note for one watched title, in the three states it can
 * be in.
 *
 * The point of the split is that **saved is not a form.** The old panel showed
 * live stars, a date picker, a bordered textarea and a character counter whether
 * or not the review was committed, so the only cue that your writing was safe
 * was the Save button no longer being pink. Here:
 *
 * - **saved** renders as prose (`.review-slip`), bracketed by hairlines, with the
 *   house overflow menu for the two things you can do to it. Nothing is an input.
 * - **editing** is entered deliberately from that menu, and is the only state
 *   that spends the accent. Rating and date come before the textarea because
 *   they are one tap each, so the cursor lands in the prose field last.
 * - **empty** (watched, nothing written) is an invitation whose stars are the way
 *   in: tapping the third star opens the editor already on 3.
 *
 * This is a separate component rather than more JSX inside MediaPanel for two
 * reasons: the panel is already ~1700 lines, and keeping `watchedEntry`-derived
 * reads out of the panel's render body stops the React Compiler bailing out of
 * the manual memoization on its watch-status callbacks.
 *
 * @param {object}   props
 * @param {object}   [props.entry]        the `history` row for this title, if any
 * @param {number}   props.rating         saved rating (0 when unrated)
 * @param {string}   props.note           saved note ('' when none)
 * @param {boolean}  props.dnf            saved "didn't finish" flag
 * @param {string}   props.watchedAt      saved watch date as YYYY-MM-DD
 * @param {(patch: {rating: number|null, note: string|null, dnf: boolean, watchedAt: string}) => Promise<boolean>} props.onSave
 * @param {() => Promise<boolean>} props.onClear  drop the rating and note, keep the watch
 */
export default function TitleReview({ entry, rating, note, dnf, watchedAt, onSave, onClear }) {
  const [editing, setEditing] = useState(false);
  const [draftRating, setDraftRating] = useState(rating);
  const [draftNote, setDraftNote] = useState(note);
  const [draftDate, setDraftDate] = useState(watchedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasSaved = !!(rating || note.trim() || dnf);

  // Every entry into the editor starts from what is stored, so an abandoned
  // edit can never leak into the next one. `seed` lets the empty state's stars
  // open the form with that rating already chosen.
  const open = (seed) => {
    setDraftRating(seed ?? rating);
    setDraftNote(note);
    setDraftDate(watchedAt);
    setError('');
    setEditing(true);
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    const ok = await onSave({
      rating: draftRating || null,
      note: draftNote.trim() || null,
      dnf,
      watchedAt: draftDate,
    });
    setSaving(false);
    // Staying open on failure keeps the user's words on screen to retry with.
    if (!ok) { setError(MEDIA_PANEL.couldNotSaveReview); return; }
    setEditing(false);
  };

  const clear = async () => {
    setError('');
    if (!await onClear()) setError(MEDIA_PANEL.couldNotSaveReview);
  };

  const errorBox = error
    ? (
      <div className="review-error" role="alert">{error}</div>
    )
    : null;

  /* ── Editing ── */
  if (editing) {
    const remaining = REVIEW_MAX - draftNote.length;
    return (
      <div className="review-edit">
        <span className="review-edit-label">{MEDIA_PANEL.editingYourReview}</span>

        <div className="review-edit-row">
          <span className="review-edit-row-label">{MEDIA_PANEL.yourRating}</span>
          <div
            className="half-star-rating"
            aria-label={draftRating ? MEDIA_PANEL.outOfFive(ratingToStars(draftRating)) : MEDIA_PANEL.noRating}
          >
            {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                className="review-star-btn"
                onClick={e => {
                  const next = ratingFromPointer(e, n);
                  setDraftRating(r => r === next ? 0 : next);
                }}
                aria-label={`Rate ${n - 0.5} or ${n} stars`}
              >
                <StarIcon fillPercent={starFillPercent(draftRating, n)} />
              </button>
            ))}
          </div>
        </div>

        <div className="review-edit-row">
          <span className="review-edit-row-label">{MEDIA_PANEL.watchedOn}</span>
          <input
            type="date"
            className="review-date-input"
            value={draftDate}
            max={localDateStr()}
            onChange={e => setDraftDate(e.target.value || watchedAt)}
            aria-label={MEDIA_PANEL.watchedOn}
          />
        </div>

        <div className="review-edit-field">
          <textarea
            className="review-textarea review-textarea--active"
            value={draftNote}
            onChange={e => { if (e.target.value.length <= REVIEW_MAX) setDraftNote(e.target.value); }}
            placeholder="Write a quick review…"
            rows={3}
            autoFocus
          />
          <span className={`review-edit-count${remaining <= 40 ? ' review-edit-count--warn' : ''}`}>
            {MEDIA_PANEL.charactersLeft(remaining)}
          </span>
        </div>

        {errorBox}

        <div className="review-edit-actions">
          <button type="button" className="review-edit-btn" onClick={() => setEditing(false)} disabled={saving}>
            {COMMON.cancel}
          </button>
          <button
            type="button"
            className="review-edit-btn review-edit-btn--primary"
            onClick={submit}
            disabled={saving}
            aria-busy={saving}
            aria-label={saving ? MEDIA_PANEL.savingReview : COMMON.save}
          >
            {saving ? <Spinner size="button" ariaHidden /> : COMMON.save}
          </button>
        </div>
      </div>
    );
  }

  /* ── Saved ── */
  if (hasSaved) {
    const stars = ratingToStars(rating);
    const text = note.trim();
    return (
      <>
        <div className={`review-slip${rating ? '' : ' review-slip--noscore'}`}>
          {rating > 0 && (
            <div className="review-slip-score">
              <div className="review-slip-num" aria-label={MEDIA_PANEL.outOfFive(stars)}>
                {stars}
                <span className="review-slip-den">/5</span>
              </div>
              <span className="review-slip-stars" aria-hidden="true">
                {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map(n => (
                  <StarIcon key={n} fillPercent={starFillPercent(rating, n)} />
                ))}
              </span>
            </div>
          )}
          <div className="review-slip-body">
            {text && <p className="review-slip-text">{text}</p>}
            <p className="review-slip-date">
              {MEDIA_PANEL.watchedOnDate(formatWatchedOn(watchedAt))}
              {dnf ? ` · ${MEDIA_PANEL.didntFinish}` : ''}
            </p>
          </div>
          <KebabMenu
            ariaLabel={MEDIA_PANEL.reviewOptions}
            items={[
              { label: MEDIA_PANEL.editReview, onClick: () => open() },
              { label: MEDIA_PANEL.removeReview, onClick: clear, danger: true },
            ]}
          />
        </div>
        {errorBox}
      </>
    );
  }

  /* ── Watched, nothing written yet ── */
  return (
    <>
      <div className="review-empty">
        <div className="review-empty-left">
          <div className="half-star-rating" aria-label={MEDIA_PANEL.noRating}>
            {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                type="button"
                className="review-star-btn"
                onClick={e => open(ratingFromPointer(e, n))}
                aria-label={`Rate ${n - 0.5} or ${n} stars`}
              >
                <StarIcon fillPercent={0} />
              </button>
            ))}
          </div>
          <span className="review-empty-label">{MEDIA_PANEL.rateAndReview}</span>
        </div>
        <button
          type="button"
          className="review-empty-write"
          onClick={() => open()}
          aria-label={entry ? MEDIA_PANEL.writeReview : MEDIA_PANEL.rateAndReview}
        >
          <PencilIcon />
        </button>
      </div>
      {errorBox}
    </>
  );
}

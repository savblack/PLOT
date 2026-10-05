import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { usePrivateNoteEditor } from '@plot/core/usePrivateNoteEditor.js';
import { PRIVATE_NOTE_LIMIT, noteLength } from '@plot/core/privateNotes.js';
import { PRIVATE_NOTES } from '@plot/core/copy/privateNotes.js';
import { REVIEW_MAX, STAR_COUNT, nextRating, ratingFromPointer, ratingToStars, starFillPercent } from '../utils/ratings.js';
import { formatWatchedOn, localDateStr } from '@plot/core/date.js';
import { COMMON } from '../copy/common.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import StarIcon from './StarIcon.jsx';
import './TitleFootBar.css';

const FOOT = MEDIA_PANEL.foot;
/** How long Undo stays offered after marking watched, and how long the drain bar runs. */
const UNDO_MS = 6000;

const TickIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>;
const PencilIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const PlusIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const LockIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
const StarMark = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" /></svg>;

/**
 * Five tappable half-star targets. `value` is the stored 1-10 rating; a hover
 * previews the half star under the pointer without touching it.
 */
function Stars({ value, disabled, ghost = false, label, onPick }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div
      className={`foot-bar-stars${ghost ? ' foot-bar-stars--ghost' : ''}`}
      role="group"
      aria-label={label}
      onPointerLeave={() => setHover(0)}
    >
      {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className="foot-bar-star"
          disabled={disabled}
          aria-label={FOOT.ratingStars(n)}
          onPointerMove={(e) => { if (e.pointerType !== 'touch') setHover(ratingFromPointer(e, n)); }}
          onClick={(e) => onPick(ratingFromPointer(e, n))}
        >
          <StarIcon fillPercent={starFillPercent(shown, n)} />
        </button>
      ))}
    </div>
  );
}

/** One of the two boxes under the stars. Empty it has a plus, written it has a pencil. */
function TakeBox({ kind, label, icon, text, draft = false, empty, labelEmpty, labelFilled, onOpen }) {
  const filled = !!text;
  return (
    <button
      type="button"
      className={`foot-bar-box foot-bar-box--${kind}${filled ? '' : ' foot-bar-box--empty'}`}
      aria-label={filled ? labelFilled : labelEmpty}
      onClick={onOpen}
    >
      <span className="foot-bar-box-edit" aria-hidden="true">{filled ? <PencilIcon /> : <PlusIcon />}</span>
      <span className="foot-bar-box-label">{icon}{label}{draft && <em className="foot-bar-box-draft">{FOOT.draft}</em>}</span>
      <span className="foot-bar-box-text">{filled ? text : empty}</span>
    </button>
  );
}

/**
 * The bar pinned to the foot of the title panel.
 *
 * One shape in every state: a head line (the question, or Thoughts? with the
 * watch chip), the stars, then once the title is watched a Review box and a
 * Private note box. Editing replaces the stars and boxes with one editor that
 * grows upward on a panel and is a sheet on a touch device.
 *
 * Rating and watched status save as you tap. The review, private note and date
 * save together from the editor, and a draft survives closing it.
 *
 * @param {number|string} props.itemId
 * @param {string} props.itemType
 * @param {string} props.title
 * @param {boolean} props.watched
 * @param {boolean} props.dnf
 * @param {number} props.rating stored 1-10, 0 for none
 * @param {string} props.review
 * @param {string} props.watchedAt yyyy-mm-dd
 * @param {boolean} props.isTv
 * @param {boolean} props.isWatching
 * @param {boolean} props.busy a status change is in flight elsewhere in the panel
 * @param {boolean} props.isPublicProfile picks the review audience line
 * @param {boolean} props.hasUser private notes need an account
 * @param {(opts?: { rating?: number }) => Promise<{ ok: boolean }>} props.onMarkWatched
 * @param {() => Promise<unknown>} props.onStartWatching
 * @param {() => Promise<boolean>} props.onUndoWatched
 * @param {(rating: number) => Promise<boolean>} props.onRate 0 clears the rating
 * @param {(fields: { note: string | null, watchedAt: string }) => Promise<boolean>} props.onSaveReview
 */
export default function TitleFootBar({
  itemId,
  itemType,
  title,
  watched,
  dnf,
  rating,
  review,
  watchedAt,
  isTv,
  isWatching,
  busy,
  isPublicProfile,
  hasUser,
  onMarkWatched,
  onStartWatching,
  onUndoWatched,
  onRate,
  onSaveReview,
}) {
  const { privateNotes } = useApp();
  const noteEditor = usePrivateNoteEditor(privateNotes ?? { rows: {} }, itemId, itemType, title);
  const showNote = hasUser && !!privateNotes;
  const savedNote = noteEditor.note;

  const [editing, setEditing] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  // Drafts outlive closing the editor; only Cancel, Save or Delete drop them.
  const [reviewDraft, setReviewDraft] = useState(null);
  const [dateDraft, setDateDraft] = useState(null);
  const focusField = useRef('review');
  const root = useRef(null);
  const [touch, setTouch] = useState(false);

  // A fresh mark settles back to the normal bar when the Undo window ends.
  useEffect(() => {
    if (!fresh) return undefined;
    const timer = setTimeout(() => setFresh(false), UNDO_MS);
    return () => clearTimeout(timer);
  }, [fresh]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- watched flipped off elsewhere (status menu): nothing left to undo
    if (!watched) setFresh(false);
  }, [watched]);

  const openEditor = useCallback((field) => {
    focusField.current = field;
    setReviewDraft((d) => d ?? review);
    setDateDraft((d) => d ?? watchedAt);
    if (showNote) noteEditor.begin();
    setError('');
    setTouch(window.matchMedia('(hover: none), (pointer: coarse)').matches);
    setEditing(true);
    setFresh(false);
  // noteEditor.begin is recreated each render; the draft it seeds is guarded inside it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, watchedAt, showNote]);

  const closeEditor = () => setEditing(false);

  const discardDrafts = () => {
    setReviewDraft(null);
    setDateDraft(null);
    noteEditor.cancel();
    setError('');
    setEditing(false);
  };

  // Focus the field the user came from, and on a touch device trap focus and
  // hand Escape back, since the editor is then a modal sheet.
  useEffect(() => {
    if (!editing) return undefined;
    const el = root.current;
    const opener = document.activeElement;
    const target = el?.querySelector(`[data-field="${focusField.current}"]`);
    target?.focus({ preventScroll: true });
    // Writing continues from the end of what is already there, not the start.
    if (target instanceof HTMLTextAreaElement) target.setSelectionRange(target.value.length, target.value.length);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setEditing(false);
        return;
      }
      if (!touch || event.key !== 'Tab') return;
      const items = [...el.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    el?.addEventListener('keydown', onKeyDown);
    return () => {
      el?.removeEventListener('keydown', onKeyDown);
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [editing, touch]);

  const mark = async (picked) => {
    const result = await onMarkWatched(picked ? { rating: picked } : undefined);
    if (!result?.ok) return;
    if (picked) {
      setStatus(FOOT.watchedAndRated(ratingToStars(picked)));
    } else {
      setFresh(true);
    }
  };

  const rate = async (picked) => {
    setError('');
    const value = nextRating(rating, picked);
    if (!watched) { await mark(picked); return; }
    const ok = await onRate(value);
    if (!ok) setError(MEDIA_PANEL.couldNotSaveReview);
  };

  const undo = async () => {
    setFresh(false);
    if (await onUndoWatched()) setStatus(FOOT.watchedRemoved);
  };

  const noteDraft = noteEditor.draft;
  const reviewText = reviewDraft ?? review;
  const reviewDirty = reviewText.trim() !== review.trim() || (dateDraft ?? watchedAt) !== watchedAt;
  // The hook's `editing` stays true from begin() until the draft is saved or cancelled,
  // which is exactly "a draft exists"; its draft reads as '' before that.
  const noteDirty = showNote && noteEditor.editing && noteDraft.trim() !== savedNote.trim();
  const noteTooLong = noteLength(noteDraft) > PRIVATE_NOTE_LIMIT;

  const save = async () => {
    if (saving || noteTooLong) return;
    setSaving(true);
    setError('');
    try {
      if (reviewDirty) {
        const ok = await onSaveReview({ note: reviewText.trim() || null, watchedAt: dateDraft || watchedAt });
        if (!ok) { setError(MEDIA_PANEL.couldNotSaveReview); return; }
      }
      if (noteDirty) {
        // An emptied note is a delete, the way the private note editor treats it.
        const ok = await noteEditor.save(!noteDraft.trim());
        if (!ok) return; // the editor holds the note's own error and keeps the draft
      }
      setReviewDraft(null);
      setDateDraft(null);
      if (!noteDirty) noteEditor.cancel();
      setStatus(FOOT.saved);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (review) {
        const ok = await onSaveReview({ note: null, watchedAt: dateDraft || watchedAt });
        if (!ok) { setError(MEDIA_PANEL.couldNotSaveReview); return; }
      }
      if (savedNote) {
        const ok = await noteEditor.save(true);
        if (!ok) return;
      }
      setReviewDraft(null);
      setDateDraft(null);
      noteEditor.cancel();
      setStatus(FOOT.deleted);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // A draft left behind by closing the editor shows in its box, tagged, so it is
  // never mistaken for lost. Once it matches what is saved it is just the text.
  const reviewIsDraft = reviewDraft !== null && reviewDraft.trim() !== review.trim();
  const reviewShown = reviewIsDraft ? reviewDraft.trim() : review;
  const noteIsDraft = showNote && noteDirty;
  const noteShown = noteIsDraft ? noteDraft.trim() : savedNote;

  const disabled = busy || saving;
  const score = rating ? ratingToStars(rating) : 0;
  const dateLabel = formatWatchedOn(watchedAt);
  const chipLabel = fresh ? FOOT.watchedJustNow : dnf ? MEDIA_PANEL.didntFinish : FOOT.watchedOn(dateLabel);
  const remaining = REVIEW_MAX - reviewText.length;
  const audience = isPublicProfile ? FOOT.reviewAudiencePublic : FOOT.reviewAudiencePrivate;
  const noteBusy = noteEditor.busy;

  return (
    <div
      ref={root}
      className={`foot-bar${editing ? ' foot-bar--open' : ''}${editing && touch ? ' foot-bar--sheet' : ''}`}
      role={editing && touch ? 'dialog' : undefined}
      aria-modal={editing && touch ? 'true' : undefined}
      aria-label={editing ? FOOT.editorTitle : undefined}
    >
      {editing && touch && <button type="button" className="foot-bar-scrim" aria-label={COMMON.close} onClick={closeEditor} />}

      <div className="foot-bar-surface">
        {editing && touch && <div className="foot-bar-handle" aria-hidden="true" />}

        <div className="foot-bar-head">
          <b className="foot-bar-title">
            {editing ? FOOT.editorTitle : watched ? FOOT.head : FOOT.unwatchedHead}
          </b>
          {!watched && !editing && <span className="foot-bar-hint">{FOOT.unwatchedHint}</span>}
          {watched && !editing && (
            <span className="foot-bar-head-end">
              {fresh && (
                <button type="button" className="btn btn-ghost btn-sm foot-bar-undo" disabled={disabled} onClick={undo}>
                  {FOOT.undo}
                </button>
              )}
              <button
                type="button"
                className="foot-bar-chip"
                disabled={disabled}
                aria-label={FOOT.changeWatchedDate(chipLabel)}
                onClick={() => openEditor('date')}
              >
                <TickIcon />
                <span>{chipLabel}</span>
                <PencilIcon />
              </button>
            </span>
          )}
        </div>

        {!editing && (
          <>
            <div className="foot-bar-main">
              <span className="foot-bar-rate">
                <Stars
                  value={rating}
                  ghost={!watched}
                  disabled={disabled}
                  label={MEDIA_PANEL.yourRating}
                  onPick={rate}
                />
                {score > 0 && <span className="foot-bar-score">{score}</span>}
              </span>
              {!watched && (
                <span className="foot-bar-actions">
                  {isTv && !isWatching && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => onStartWatching()}>
                      {FOOT.imWatching}
                    </button>
                  )}
                  <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={() => mark()}>
                    {FOOT.iveWatched}
                  </button>
                </span>
              )}
            </div>
            {error && <p className="foot-bar-error" role="alert">{error}</p>}

            {watched && (
              <div className="foot-bar-boxes">
                <TakeBox
                  kind="review"
                  label={FOOT.reviewLabel}
                  icon={<StarMark />}
                  text={reviewShown}
                  draft={reviewIsDraft}
                  empty={FOOT.reviewEmpty}
                  labelEmpty={FOOT.addReview}
                  labelFilled={FOOT.editReview}
                  onOpen={() => openEditor('review')}
                />
                {showNote && (
                  <TakeBox
                    kind="private"
                    label={FOOT.noteLabel}
                    icon={<LockIcon />}
                    text={noteShown}
                    draft={noteIsDraft}
                    empty={FOOT.noteEmpty}
                    labelEmpty={FOOT.addNote}
                    labelFilled={FOOT.editNote}
                    onOpen={() => openEditor('note')}
                  />
                )}
              </div>
            )}
          </>
        )}

        {editing && (
          <div className="foot-bar-editor">
            <div className="foot-bar-editor-rating">
              <span className="foot-bar-label">{FOOT.rating}</span>
              <span className="foot-bar-rate">
                <Stars value={rating} disabled={disabled} label={MEDIA_PANEL.yourRating} onPick={rate} />
                {score > 0 && <span className="foot-bar-score">{score}</span>}
              </span>
            </div>

            <section className="foot-bar-field foot-bar-field--review">
              <label htmlFor="foot-bar-review">
                <span className="foot-bar-tag"><StarMark />{FOOT.reviewLabel}</span>
                <span className="foot-bar-audience">{audience}</span>
              </label>
              <textarea
                id="foot-bar-review"
                data-field="review"
                value={reviewText}
                maxLength={REVIEW_MAX}
                placeholder={FOOT.reviewPlaceholder}
                disabled={saving}
                onChange={(e) => setReviewDraft(e.target.value)}
              />
              <div className={`foot-bar-count${remaining <= 40 ? ' foot-bar-count--near' : ''}`}>{remaining}</div>
            </section>

            {showNote && (
              <section className="foot-bar-field foot-bar-field--private ph-no-capture ph-mask" data-private="true">
                <label htmlFor="foot-bar-note">
                  <span className="foot-bar-tag"><LockIcon />{FOOT.noteLabel}</span>
                  <span className="foot-bar-audience">{FOOT.noteAudience}</span>
                </label>
                <textarea
                  id="foot-bar-note"
                  data-field="note"
                  value={noteDraft}
                  placeholder={FOOT.noteEmpty}
                  disabled={saving || noteBusy}
                  onChange={(e) => noteEditor.setDraft(e.target.value)}
                />
                {noteTooLong && <p className="foot-bar-error" role="alert">{noteLength(noteDraft)}/{PRIVATE_NOTE_LIMIT}</p>}
                {noteEditor.error && <p className="foot-bar-error" role="alert">{noteEditor.error}</p>}
                {noteEditor.conflict && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={noteEditor.reload}>
                    {PRIVATE_NOTES.reload}
                  </button>
                )}
              </section>
            )}

            {error && <p className="foot-bar-error" role="alert">{error}</p>}

            <div className="foot-bar-editor-actions">
              <div className="foot-bar-date">
                <label htmlFor="foot-bar-date">{MEDIA_PANEL.watchedOn}</label>
                <input
                  id="foot-bar-date"
                  data-field="date"
                  type="date"
                  value={dateDraft ?? watchedAt}
                  max={localDateStr()}
                  disabled={saving}
                  onChange={(e) => setDateDraft(e.target.value || watchedAt)}
                />
              </div>
              <span className="foot-bar-actions">
                {(review || savedNote) && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={saving || noteBusy} onClick={remove}>
                    {COMMON.delete}
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={discardDrafts}>
                  {COMMON.cancel}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={saving || noteBusy || noteTooLong || (!reviewDirty && !noteDirty)}
                  aria-busy={saving}
                  onClick={save}
                >
                  {saving ? COMMON.saving : COMMON.save}
                </button>
              </span>
            </div>
          </div>
        )}

        {fresh && !editing && <span className="foot-bar-drain" aria-hidden="true" />}
      </div>

      <span className="foot-bar-sr" role="status" aria-live="polite">{status || noteEditor.status}</span>
    </div>
  );
}

// State and write paths for the foot bar pinned to the bottom of the title
// panel. Shared by web (TitleFootBar.jsx) and mobile (TitleFootBar.tsx): each
// app draws the bar, this decides what it does. No DOM or native APIs in here.
//
// One shape in every state. Rating and watched status save as you tap; the
// review, the private note and the date save together from one editor, and a
// draft survives closing it. Marking watched confirms in place with Undo for
// UNDO_MS, then settles.
import { useCallback, useEffect, useState } from 'react';
import { usePrivateNoteEditor } from './usePrivateNoteEditor.js';
import { PRIVATE_NOTE_LIMIT, noteLength } from './privateNotes.js';
import { REVIEW_MAX, nextRating, ratingToStars } from './ratings.js';
import { MEDIA_PANEL } from './copy/mediaPanel.js';

const FOOT = MEDIA_PANEL.foot;

/** How long Undo stays offered after marking watched. */
export const UNDO_MS = 6000;

/** @typedef {'review' | 'note' | 'date'} FootBarField */

/**
 * @param {Object} args
 * @param {number|string} args.itemId
 * @param {string} args.itemType
 * @param {string} args.title
 * @param {boolean} args.watched
 * @param {number} args.rating stored 1-10, 0 for none
 * @param {string} args.review the saved written review
 * @param {string} args.watchedAt yyyy-mm-dd
 * @param {any} [args.privateNotes] the private notes store; without it (or without a user) the note box is hidden
 * @param {boolean} args.hasUser
 * @param {(opts?: { rating?: number }) => Promise<{ ok: boolean } | undefined>} args.onMarkWatched
 * @param {() => Promise<boolean>} args.onUndoWatched
 * @param {(rating: number) => Promise<boolean>} args.onRate 0 clears the rating
 * @param {(fields: { note: string | null, watchedAt: string }) => Promise<boolean>} args.onSaveReview
 */
export function useTitleFootBar({
  itemId,
  itemType,
  title,
  watched,
  rating,
  review,
  watchedAt,
  privateNotes,
  hasUser,
  onMarkWatched,
  onUndoWatched,
  onRate,
  onSaveReview,
}) {
  const noteEditor = usePrivateNoteEditor(privateNotes ?? { rows: {} }, itemId, itemType, title);
  const showNote = hasUser && !!privateNotes;
  const savedNote = noteEditor.note;

  const [editing, setEditing] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  // Drafts outlive closing the editor; only Cancel, Save or Delete drop them.
  const [reviewDraft, setReviewDraft] = useState(/** @type {string | null} */ (null));
  const [dateDraft, setDateDraft] = useState(/** @type {string | null} */ (null));
  const [focusField, setFocusField] = useState(/** @type {FootBarField} */ ('review'));

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

  const openEditor = useCallback((/** @type {FootBarField} */ field) => {
    setFocusField(field);
    setReviewDraft((d) => d ?? review);
    setDateDraft((d) => d ?? watchedAt);
    if (showNote) noteEditor.begin();
    setError('');
    setEditing(true);
    setFresh(false);
  // noteEditor.begin is recreated each render; the draft it seeds is guarded inside it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, watchedAt, showNote]);

  const closeEditor = useCallback(() => setEditing(false), []);

  const discardDrafts = () => {
    setReviewDraft(null);
    setDateDraft(null);
    noteEditor.cancel();
    setError('');
    setEditing(false);
  };

  const mark = async (/** @type {number | undefined} */ picked = undefined) => {
    const result = await onMarkWatched(picked ? { rating: picked } : undefined);
    if (!result?.ok) return;
    if (picked) setStatus(FOOT.watchedAndRated(ratingToStars(picked)));
    else setFresh(true);
  };

  /** A star tap. On an unwatched title it logs the title as watched and rated in one write. */
  const rate = async (/** @type {number} */ picked) => {
    setError('');
    if (!watched) { await mark(picked); return; }
    const ok = await onRate(nextRating(rating, picked));
    if (!ok) setError(MEDIA_PANEL.couldNotSaveReview);
  };

  const undo = async () => {
    setFresh(false);
    if (await onUndoWatched()) setStatus(FOOT.watchedRemoved);
  };

  const noteDraft = noteEditor.draft;
  const reviewText = reviewDraft ?? review;
  const reviewDirty = reviewText.trim() !== review.trim() || (dateDraft ?? watchedAt) !== watchedAt;
  // The note editor's `editing` stays true from begin() until the draft is saved or
  // cancelled, which is exactly "a draft exists"; its draft reads as '' before that.
  const noteDirty = showNote && noteEditor.editing && noteDraft.trim() !== savedNote.trim();
  const noteTooLong = noteLength(noteDraft) > PRIVATE_NOTE_LIMIT;

  // A draft left behind by closing the editor shows in its box, tagged, so it is
  // never mistaken for lost. Once it matches what is saved it is just the text.
  const reviewIsDraft = reviewDraft !== null && reviewDraft.trim() !== review.trim();
  const reviewShown = reviewIsDraft ? /** @type {string} */ (reviewDraft).trim() : review;
  const noteIsDraft = showNote && noteDirty;
  const noteShown = noteIsDraft ? noteDraft.trim() : savedNote;

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

  /** Deletes the written review and the private note. The star rating stays. */
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

  return {
    // state
    editing, fresh, saving, error, status, focusField, showNote,
    // what the boxes and editor show
    savedNote, reviewText, dateValue: dateDraft ?? watchedAt, noteDraft,
    reviewIsDraft, reviewShown, noteIsDraft, noteShown,
    remaining: REVIEW_MAX - reviewText.length,
    reviewDirty, noteDirty, noteTooLong,
    noteEditor,
    // actions
    openEditor, closeEditor, discardDrafts,
    setReviewText: setReviewDraft,
    setDateValue: (/** @type {string} */ value) => setDateDraft(value || watchedAt),
    setNoteText: noteEditor.setDraft,
    mark, rate, undo, save, remove,
  };
}

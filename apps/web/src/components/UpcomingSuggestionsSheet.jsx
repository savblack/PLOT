// Web-only sheet. The lists it shows come from @plot/core/upcomingSuggestions.js,
// which mobile can call when it gets the same sheet. This file is the dialog,
// the poster rows, and the one-tap watchlist save.

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { localDateStr, weekdayDayMonth } from '@plot/core/date.js';
import { getTmdbRegion, tmdb } from '@plot/core/tmdb.js';
import {
  CALENDAR_SUGGESTIONS_SOURCE,
  loadUpcomingSuggestions,
  trackedTitleIds,
} from '@plot/core/upcomingSuggestions.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import { COMMON } from '../copy/common.js';
import { MEDIA } from '../copy/media.js';
import { posterUrl } from '../utils/images.js';
import SheetHeader from './SheetHeader.jsx';
import './UpcomingSuggestionsSheet.css';

const COPY = CALENDAR_VIEW.suggest;

function whenLabel(item) {
  if (item.media_type === 'tv') return COPY.nextEpisode(item.next_code, weekdayDayMonth(item.next_air_date));
  const when = weekdayDayMonth(item.release_date);
  return item._cinema ? COPY.inTheaters(when) : COPY.streaming(when);
}

function SuggestionRow({ item, saved, pending, failed, onAdd }) {
  const title = item.title || item.name;
  return (
    <li className="uss-row">
      <img src={posterUrl(item.poster_path, 'w92')} alt="" width="42" height="63" />
      <div className="uss-copy">
        <div className="uss-title">{title}</div>
        <div className="uss-meta">{whenLabel(item)}</div>
        {failed && <div className="uss-error" role="alert">{COMMON.genericError}</div>}
      </div>
      <button
        type="button"
        className={`btn btn-sm ${saved ? 'btn-secondary' : 'btn-primary'}`}
        disabled={saved || pending}
        aria-label={saved ? `${title}, ${COPY.added}` : `${MEDIA.saveToWatchlist}, ${title}`}
        onClick={() => onAdd(item)}
      >
        {pending ? COMMON.saving : saved ? COPY.added : COMMON.add}
      </button>
    </li>
  );
}

function SuggestionSection({ heading, body, items, unavailable, savedIds, pendingIds, failedId, onAdd, onRetry }) {
  return (
    <section className="uss-section" aria-label={heading}>
      <h3>{heading}</h3>
      <p>{body}</p>
      {unavailable ? (
        <div className="uss-status">
          <p>{COPY.unavailable}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>{COPY.retry}</button>
        </div>
      ) : items.length === 0 ? (
        <p className="uss-status">{COPY.nothingToSuggest}</p>
      ) : (
        <ul className="uss-list">
          {items.map(item => (
            <SuggestionRow
              key={`${item.media_type}-${item.id}`}
              item={item}
              saved={savedIds.has(item.id)}
              pending={pendingIds.has(item.id)}
              failed={failedId === item.id}
              onAdd={onAdd}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The filled dialog. Stories and tests pass titles in. The sheet below loads them.
 */
export function UpcomingSuggestionsDialog({
  shows = [],
  movies = [],
  loading = false,
  showsUnavailable = false,
  moviesUnavailable = false,
  savedIds = new Set(),
  pendingIds = new Set(),
  failedId = null,
  onAdd,
  onRetry,
  onClose,
}) {
  const titleId = useId();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const dialog = (
    <div className="uss-overlay" onClick={onClose}>
      <div
        className="uss"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={event => event.stopPropagation()}
      >
        <div className="uss-head">
          <SheetHeader title={<span id={titleId}>{COPY.title}</span>} onClose={onClose} />
        </div>
        <div className="uss-scroll">
          <p className="uss-intro">{COPY.body}</p>
          {loading ? (
            <p className="uss-status" role="status">{COMMON.loading}</p>
          ) : (
            <>
              <SuggestionSection
                heading={COPY.airingHeading}
                body={COPY.airingBody}
                items={shows}
                unavailable={showsUnavailable}
                savedIds={savedIds}
                pendingIds={pendingIds}
                failedId={failedId}
                onAdd={onAdd}
                onRetry={onRetry}
              />
              <SuggestionSection
                heading={COPY.moviesHeading}
                body={COPY.moviesBody}
                items={movies}
                unavailable={moviesUnavailable}
                savedIds={savedIds}
                pendingIds={pendingIds}
                failedId={failedId}
                onAdd={onAdd}
                onRetry={onRetry}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );

  // SheetHeader's close button is the one we want focused. The ref on a
  // wrapper does not reach it, so focus the dialog's first button after paint.
  return createPortal(
    <FocusClose>{dialog}</FocusClose>,
    document.body,
  );
}

function FocusClose({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);
  return <div ref={ref}>{children}</div>;
}

export default function UpcomingSuggestionsSheet({ open, onClose, watchlist, watching }) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [shows, setShows] = useState([]);
  const [movies, setMovies] = useState([]);
  const [showsUnavailable, setShowsUnavailable] = useState(false);
  const [moviesUnavailable, setMoviesUnavailable] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [failedId, setFailedId] = useState(null);
  const trackedRef = useRef(trackedTitleIds(watchlist?.items, watching?.items));

  useEffect(() => {
    trackedRef.current = trackedTitleIds(watchlist?.items, watching?.items);
  }, [watchlist?.items, watching?.items]);

  useEffect(() => {
    if (!open || watchlist?.loading || watching?.loading) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new open or retry starts a fresh load
    setLoading(true);
    setFailedId(null);
    loadUpcomingSuggestions({
      discoverTV: (params) => tmdb.discoverTV(params),
      discoverMovies: (params) => tmdb.discoverMovies(params),
      getTVDetails: (id) => tmdb.getTVDetails(id),
      trackedIds: trackedRef.current,
      todayStr: localDateStr(),
      region: getTmdbRegion(),
    }).then((result) => {
      if (cancelled) return;
      setShows(result.shows);
      setMovies(result.movies);
      setShowsUnavailable(result.showsUnavailable);
      setMoviesUnavailable(result.moviesUnavailable);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setShows([]);
      setMovies([]);
      setShowsUnavailable(true);
      setMoviesUnavailable(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, attempt, watchlist?.loading, watching?.loading]);

  if (!open) return null;

  const savedIds = trackedTitleIds(watchlist?.items, watching?.items);

  const onAdd = async (item) => {
    if (pendingIds.has(item.id) || savedIds.has(item.id)) return;
    setPendingIds(prev => new Set(prev).add(item.id));
    setFailedId(current => (current === item.id ? null : current));
    const saved = await watchlist.addToList(item, { source: CALENDAR_SUGGESTIONS_SOURCE });
    setPendingIds(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    if (!saved) setFailedId(item.id);
  };

  return (
    <UpcomingSuggestionsDialog
      shows={shows}
      movies={movies}
      loading={loading}
      showsUnavailable={showsUnavailable}
      moviesUnavailable={moviesUnavailable}
      savedIds={savedIds}
      pendingIds={pendingIds}
      failedId={failedId}
      onAdd={onAdd}
      onRetry={() => setAttempt(n => n + 1)}
      onClose={onClose}
    />
  );
}

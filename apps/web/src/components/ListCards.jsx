import { isTypeNarrowed, ALL_TYPES } from '@plot/core/mediaFilters.js';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';
import { useGenres } from '../hooks/useGenres.js';
import { posterUrl } from '../utils/images.js';
import { historyRatingLabel } from '../utils/history.js';
import { MEDIA } from '../copy/media.js';
import { HISTORY_VIEW } from '../copy/historyView.js';

/* Cards and chrome shared by My Lists and History. Both pages are the
   viewer's own titles laid out as poster cards, so the card, the grid and the
   type filter are written once here rather than once per page.

   Web-only by nature (DOM layout); the filtering itself is
   @plot/core/mediaFilters, which mobile already uses. */

const TYPE_OPTIONS = [
  { id: 'tv',     label: MEDIA.tv     },
  { id: 'cinema', label: MEDIA.cinema },
  { id: 'movie',  label: MEDIA.movies },
];

/* What the pill says: "All types · All genres" until something is narrowed,
   then the chosen names (or a count once that gets long). Same wording as
   Home's toolbar. */
function filterSummary(typeFilters, genreFilters, genres) {
  const types = isTypeNarrowed(typeFilters)
    ? TYPE_OPTIONS.filter(o => typeFilters.includes(o.id)).map(o => o.label).join(', ')
    : MEDIA.allTypes;
  const picked = genres.filter(g => genreFilters.includes(g.id)).map(g => g.name);
  const genreText = picked.length === 0 ? MEDIA.allGenres : picked.length <= 2 ? picked.join(', ') : `${picked.length} genres`;
  return `${types} · ${genreText}`;
}

/* The labelled type + genre pill, the same control as Home's. */
export function TypeGenreFilter({ ariaLabel, typeFilters, setTypeFilters, genreFilters, setGenreFilters, mobileControls = false }) {
  const { genres } = useGenres();
  return (
    <GroupedFilterMenu
      mobileControls={mobileControls}
      ariaLabel={ariaLabel}
      label={filterSummary(typeFilters, genreFilters, genres)}
      groups={[
        { heading: MEDIA.typeHeading, allLabel: MEDIA.allTypes, options: TYPE_OPTIONS, value: typeFilters, onChange: setTypeFilters, defaultValue: ALL_TYPES },
        { heading: MEDIA.genreHeading, allLabel: MEDIA.allGenres, columns: 2, options: genres.map(g => ({ id: g.id, label: g.name })), value: genreFilters, onChange: setGenreFilters },
      ]}
    />
  );
}

/* Selection circle, top-right overlay used by every list's multi-select mode. */
export function SelectCircle({ selected, variant = 'grid', onClick, label }) {
  return (
    <button
      type="button"
      className={`select-circle select-circle--${variant}${selected ? ' selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
    >
      {selected && (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

export function CardGrid({ children }) {
  return <div className="mylists-grid">{children}</div>;
}

/* One title: poster, title, an optional meta line and an optional progress
   bar. The "view details" control is a real button; the select circle is a
   sibling anchored to the card so no control nests inside another. */
export function ListCard({ title, img, meta, progress, onOpen, editMode = false, selected = false, onToggleSelect, overlay }) {
  const press = editMode ? onToggleSelect : onOpen;
  const label = editMode
    ? (selected ? `Deselect ${title}` : `Select ${title}`)
    : `View details for ${title}`;
  return (
    <div className="mylists-card">
      <button
        type="button"
        className="mylists-card-hit interactive-surface"
        onClick={press}
        aria-label={label}
        aria-pressed={editMode ? selected : undefined}
      >
        <div className="mylists-card-img">
          {img
            ? <img src={img} alt="" loading="lazy" />
            : <span className="mylists-card-placeholder">{title}</span>}
          {overlay}
        </div>
        <div className="mylists-card-title">{title}</div>
        {meta ? <div className="mylists-card-meta">{meta}</div> : null}
        {progress != null && (
          <div className="mylists-card-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </button>
      {editMode && (
        <SelectCircle
          variant="grid"
          selected={selected}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          label={label}
        />
      )}
    </div>
  );
}

/* watched_at is a plain calendar date. Read the digits rather than handing
   the string to Date, which would parse it as UTC midnight and roll it back
   a day anywhere behind UTC. */
function watchedLabel(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/* A history entry as a card. A written review is a permanent icon in the
   meta line, never a toggle: every card stays the same height whether or
   not it carries one. Reading the review happens in the media panel. */
export function HistoryCard({ entry, openPanel }) {
  const title  = entry.title || MEDIA.unknown;
  const date   = watchedLabel(entry.watched_at);
  const rating = historyRatingLabel(entry.rating);
  const meta = (
    <>
      {date && <span>{date}</span>}
      {rating && <span className="mylists-card-rating">{rating}</span>}
      {entry.note && (
        <span className="mylists-card-note" title={HISTORY_VIEW.reviewed} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" />
          </svg>
        </span>
      )}
    </>
  );
  return (
    <ListCard
      title={title}
      img={posterUrl(entry.poster_path, 'w185')}
      meta={meta}
      onOpen={() => openPanel(entry.tmdb_id, entry.media_type || 'movie')}
    />
  );
}

import { useId, useState } from 'react';
import { MEDIA } from '../copy/media.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';
import { TYPE_ROWS } from './sideFilterRows.js';

/* The Show and Genre filter rows from the Calendar's left column, shared so
   the History page's panel is the same control and not a lookalike. Show is a
   row per type with a tick; Genre is one row that opens the grouped genre
   menu beside the column. Extra sections (History's Status rows) render as
   children after Genre, in the same row style.

   `genreInline` opens the genres as rows under the Genre row, inside the
   panel, in place of the menu beside the column. New Releases uses it: its
   panel sits at the top of the page, where the menu opened partly above the
   viewport and over the posters (Savannah, 17 Nov 2026). */

const ChevronRight = () => <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6" /></svg>;
const Tick = () => <svg viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12" /></svg>;

/* "All genres", the one or two picked, or a count. */
function genreSummary(genreFilters, genres) {
  const picked = genres.filter(g => genreFilters.includes(g.id)).map(g => g.name);
  if (picked.length === 0) return MEDIA.allGenres;
  if (picked.length <= 2) return picked.join(', ');
  return CALENDAR_VIEW.filter.genreCount(picked.length);
}

/**
 * One tickable row. Exported so a page can add its own section in the same
 * style beneath Show and Genre.
 * @param {{ label: string, on: boolean, onToggle: () => void }} props
 */
export function FilterRow({ label, on, onToggle }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      className={`cal-filter-row${on ? '' : ' cal-filter-row--off'}`}
      onClick={onToggle}
    >
      <span className="cal-filter-name">{label}</span>
      {on && <span className="cal-filter-tick"><Tick /></span>}
    </button>
  );
}

/* Genre as rows inside the panel: the summary row opens and closes the list,
   "All genres" clears the selection, and each genre is a tickable row. */
function InlineGenres({ genreFilters, setGenreFilters, genres }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const toggle = (id) => setGenreFilters(
    genreFilters.includes(id) ? genreFilters.filter(g => g !== id) : [...genreFilters, id],
  );
  return (
    <div>
      <button
        type="button"
        className="cal-filter-row"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className="cal-filter-name">{genreSummary(genreFilters, genres)}</span>
        <span className={`cal-filter-chev cal-filter-chev--down${open ? ' cal-filter-chev--open' : ''}`}><ChevronRight /></span>
      </button>
      {open && (
        <div id={listId} className="cal-filter-inline" role="group" aria-label={CALENDAR_VIEW.filter.genre}>
          <FilterRow label={MEDIA.allGenres} on={genreFilters.length === 0} onToggle={() => setGenreFilters([])} />
          {genres.map(g => (
            <FilterRow key={g.id} label={g.name} on={genreFilters.includes(g.id)} onToggle={() => toggle(g.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string[]} props.typeFilters
 * @param {(v: string[]) => void} props.setTypeFilters
 * @param {number[]} props.genreFilters
 * @param {(v: number[]) => void} props.setGenreFilters
 * @param {{id: number, name: string}[]} props.genres
 * @param {{id: string, label: string}[]} [props.typeRows]  Defaults to TV, Movies, Cinema.
 * @param {import('react').ReactNode} [props.children]  Extra sections after Genre.
 * @param {boolean} [props.showGenre]  false where items carry no genres (Your people).
 * @param {boolean} [props.genreInline]  Open the genres as rows inside the panel, not as a menu beside it.
 */
export default function SideFilters({
  typeFilters, setTypeFilters, genreFilters, setGenreFilters, genres,
  typeRows = TYPE_ROWS, children, showGenre = true, genreInline = false,
}) {
  // A type can be switched off only while another stays on: with nothing
  // ticked the filter would read as "show nothing" but behave as "show all".
  const toggleType = (id) => {
    if (typeFilters.includes(id)) {
      if (typeFilters.length > 1) setTypeFilters(typeFilters.filter(t => t !== id));
    } else {
      setTypeFilters([...typeFilters, id]);
    }
  };

  return (
    <>
      <div className="cal-filter">
        <div className="cal-filter-label">{CALENDAR_VIEW.filter.show}</div>
        <div>
          {typeRows.map(({ id, label }) => (
            <FilterRow key={id} label={label} on={typeFilters.includes(id)} onToggle={() => toggleType(id)} />
          ))}
        </div>
      </div>

      {showGenre && <div className="cal-filter">
        <div className="cal-filter-label">{CALENDAR_VIEW.filter.genre}</div>
        {genreInline ? (
          <InlineGenres genreFilters={genreFilters} setGenreFilters={setGenreFilters} genres={genres} />
        ) : <GroupedFilterMenu
          ariaLabel={CALENDAR_VIEW.filter.genre}
          className="cal-filter-menu"
          groups={[{
            heading: MEDIA.genreHeading,
            options: genres.map(g => ({ id: g.id, label: g.name })),
            value: genreFilters,
            onChange: setGenreFilters,
          }]}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="cal-filter-row"
              onClick={toggle}
              aria-expanded={open}
              aria-haspopup="true"
            >
              <span className="cal-filter-name">{genreSummary(genreFilters, genres)}</span>
              <span className="cal-filter-chev"><ChevronRight /></span>
            </button>
          )}
        />}
      </div>}

      {children}
    </>
  );
}

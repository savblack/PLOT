import { MEDIA } from '../copy/media.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';
import { TYPE_ROWS } from './sideFilterRows.js';

/* The Show and Genre filter rows from the Calendar's left column, shared so
   the History page's panel is the same control and not a lookalike. Show is a
   row per type with a tick; Genre is one row that opens the grouped genre
   menu beside the column. Extra sections (History's Status rows) render as
   children after Genre, in the same row style. */

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

/**
 * @param {object} props
 * @param {string[]} props.typeFilters
 * @param {(v: string[]) => void} props.setTypeFilters
 * @param {number[]} props.genreFilters
 * @param {(v: number[]) => void} props.setGenreFilters
 * @param {{id: number, name: string}[]} props.genres
 * @param {{id: string, label: string}[]} [props.typeRows]  Defaults to TV, Movies, Cinema.
 * @param {import('react').ReactNode} [props.children]  Extra sections after Genre.
 */
export default function SideFilters({
  typeFilters, setTypeFilters, genreFilters, setGenreFilters, genres,
  typeRows = TYPE_ROWS, children,
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

      <div className="cal-filter">
        <div className="cal-filter-label">{CALENDAR_VIEW.filter.genre}</div>
        <GroupedFilterMenu
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
        />
      </div>

      {children}
    </>
  );
}

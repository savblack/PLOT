import { posterUrl } from '../utils/images.js';
import { SelectCircle } from './ListCards.jsx';

/* A collection's cover: its three newest posters standing upright side by
   side, the front one centred and full size, the two behind peeking out
   either side, all three on one baseline. No field behind them; the posters
   are the object. The name and count sit under it; `labelled={false}` gives
   just the fan, for a list page's header. The whole cover is one "open"
   button; the select circle is a sibling so no control nests inside another. */

/**
 * @param {object}   props
 * @param {string}   props.name
 * @param {string}   [props.anchorId]      optional in-page target for a collection index
 * @param {string}   [props.count]
 * @param {string[]} props.posters        poster_paths, front first (up to 3 used)
 * @param {Function} [props.onOpen]
 * @param {boolean}  [props.labelled]
 * @param {boolean}  [props.editMode]
 * @param {boolean}  [props.selectable]   whether this cover can be ticked in edit mode
 * @param {boolean}  [props.selected]
 * @param {Function} [props.onToggleSelect]
 * @param {boolean}  [props.dim]          nothing in this list matches the page filter
 * @param {import('react').ReactNode} [props.badge]
 * @param {number}   [props.size]         fan width in px when not filling its grid cell
 */
export default function ListCover({
  name, anchorId, count, posters = [], onOpen, labelled = true,
  editMode = false, selectable = true, selected = false, onToggleSelect, dim = false, badge, size,
}) {
  const paths = posters.filter(Boolean).slice(0, 3);
  // Slot order: back-left, back-right, front. The front is the newest.
  const fan = [paths[1], paths[2], paths[0]];
  const label = editMode
    ? (selected ? `Deselect ${name}` : `Select ${name}`)
    : `Open ${name}`;
  const press = editMode ? (selectable ? onToggleSelect : undefined) : onOpen;
  const classes = ['list-cover'];
  if (editMode && !selectable) classes.push('list-cover--dim');
  if (dim) classes.push('list-cover--dim');

  return (
    <div id={anchorId} className={classes.join(' ')} style={size ? { width: size } : undefined}>
      <button
        type="button"
        className="list-cover-hit interactive-surface"
        onClick={press}
        aria-label={label}
        aria-pressed={editMode && selectable ? selected : undefined}
        disabled={editMode && !selectable}
      >
        <div className="list-cover-art">
          {fan.map((path, i) => (
            <span key={i} className={`list-cover-poster list-cover-poster--${['left', 'right', 'front'][i]}${path ? '' : ' is-empty'}`}>
              {path && <img src={posterUrl(path, 'w185')} alt="" loading="lazy" />}
            </span>
          ))}
        </div>
        {labelled && (
          <div className="list-cover-label">
            <span className="list-cover-name">{name}{badge}</span>
            {count && <span className="list-cover-count">{count}</span>}
          </div>
        )}
      </button>
      {editMode && selectable && (
        <SelectCircle variant="grid" selected={selected} onClick={(e) => { e.stopPropagation(); onToggleSelect(); }} label={label} />
      )}
    </div>
  );
}

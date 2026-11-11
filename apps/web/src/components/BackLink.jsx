// The one back control: a chevron and the name of the page it leads to.
//
// Eight pages each drew their own (an arrow glyph and "Back", a bare chevron
// button, a plain name with no chevron, an accent-colored "‹ My Lists"), in
// five sizes and three colors (design audit, 10 Nov 2026, pick 1.2 A). A
// panel or dialog closes with an X in its top right corner instead; this is
// only for pages.
//
// Web only: mobile gets its back control from the native stack header.
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IconChevronLeft } from './navIcons.jsx';
import './BackLink.css';

/**
 * @param {object} props
 * @param {string} props.to  where it leads. With `history`, where it leads
 *   when there is nothing to go back to.
 * @param {string} props.label  the name of that page ("My Lists",
 *   "Settings"), or "Back" when the reader could have come from anywhere.
 * @param {boolean} [props.history]  go back to wherever the reader came from
 *   inside the app, for a page with no single parent (a person, a legal
 *   page). Opened directly, it follows `to`.
 * @param {string} [props.className]  layout only (margins, where it shows).
 */
export default function BackLink({ to, label, history = false, className = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  // react-router gives the first entry of a visit the key "default"; any
  // other key means this page was reached by an in-app navigation.
  const canGoBack = history && location.key !== 'default';
  const onClick = (e) => {
    if (!canGoBack || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(-1);
  };
  return (
    <Link to={to} className={`back-link${className ? ` ${className}` : ''}`} onClick={onClick}>
      <IconChevronLeft />
      <span>{label}</span>
    </Link>
  );
}

// The web app's chips, matching the phone app's (apps/mobile/components/Chip.tsx).
//
//   Chip  a pill you press to pick or filter (genres, a sort, "By date").
//         Deeper cream when off, the pink fill with a charcoal label when on.
//         One height per size, no outline.
//   Tag   a small label that only says something (Film, Series, Premium, a
//         count). Never pressable. `neutral` is the deeper cream, `sage` marks
//         kind and availability, `accent` marks the one lead per panel.
//
// Stateful action pills with their own meaning (Follow, Watchlist, watch
// status) are not chips and keep their own components.
import './Chip.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {boolean} [props.selected] on or off; leave unset for a chip that
 *   only does something (a recent search), so it is not announced as a toggle
 * @param {(event: any) => void} props.onClick
 * @param {'md' | 'sm'} [props.size]
 * @param {import('react').ReactNode} [props.icon] a small glyph before the label
 * @param {boolean} [props.disabled]
 * @param {'radio' | 'checkbox' | 'tab'} [props.role] one-of-many, any-of-many, or a tab row; plain buttons say pressed
 * @param {string} [props.ariaLabel]
 * @param {string} [props.className] outer spacing only
 */
export default function Chip({ label, selected, onClick, size = 'md', icon, disabled = false, role, ariaLabel, className = '' }) {
  const on = selected === true;
  const state = selected === undefined
    ? {}
    : role === 'radio' || role === 'checkbox'
      ? { 'aria-checked': on }
      : role === 'tab'
        ? { 'aria-selected': on }
        : { 'aria-pressed': on };
  return (
    <button
      type="button"
      role={role}
      className={`pick-chip pick-chip--${size}${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      {...state}
    >
      {icon}
      <span className="pick-chip-label">{label}</span>
    </button>
  );
}

/**
 * @param {{ label: string, tone?: 'neutral' | 'sage' | 'accent' | 'artwork' | 'success' | 'warning', icon?: import('react').ReactNode, className?: string }} props
 * success: out today, warning: in the next week (release countdowns).
 */
export function Tag({ label, tone = 'neutral', icon, className = '' }) {
  return (
    <span className={`tag tag--${tone}${className ? ` ${className}` : ''}`}>
      {icon}
      {label}
    </span>
  );
}

/** A wrapping row of chips or tags with the standard gap. */
export function ChipRow({ children, className = '', ...rest }) {
  return <div className={`chip-row${className ? ` ${className}` : ''}`} {...rest}>{children}</div>;
}

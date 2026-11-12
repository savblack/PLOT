// The foot of a dialog you type into: its one main button, bottom right.
//
// The main button used to move between dialogs. Edit profile had Save in the
// top right corner, a new smart list had Cancel and Create at the bottom, a
// new shared list had Create with no Cancel, and each drew its buttons at a
// different size (design audit, 10 Nov 2026, picks 2.2 A and 4.2 B).
//
// There is no Cancel in the foot: every dialog closes with Cancel in its
// header's top right corner (SheetHeader), and a second button that does the
// same thing was one more thing to read. A sheet that saves as you go has no
// foot at all.
//
// Web only: mobile has its own sheet footers.
import './DialogActions.css';

/**
 * @param {object} props
 * @param {{ label: string, onClick: () => void, disabled?: boolean }} props.primary
 * @param {boolean} [props.busy]  a save is in flight: the button waits.
 * @param {import('react').ReactNode} [props.note]  one quiet line on the left.
 * @param {string} [props.error]  shown above the buttons, announced.
 */
export default function DialogActions({ primary, busy = false, note, error }) {
  return (
    <div className="dialog-actions">
      {error && <p className="dialog-actions-error" role="alert">{error}</p>}
      {note && <span className="dialog-actions-note">{note}</span>}
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || primary.disabled} onClick={primary.onClick}>{primary.label}</button>
    </div>
  );
}

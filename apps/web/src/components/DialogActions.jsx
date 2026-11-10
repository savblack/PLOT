// The foot of a dialog you type into: Cancel, then the main button, always
// bottom right, the main button on the right.
//
// The main button used to move between dialogs. Edit profile had Save in the
// top right corner, a new smart list had Cancel and Create at the bottom, a
// new shared list had Create with no Cancel, and each drew its buttons at a
// different size (design audit, 10 Nov 2026, picks 2.2 A and 4.2 B). A sheet
// that saves as you go has no foot at all: it closes with the X.
//
// Web only: mobile has its own sheet footers.
import { COMMON } from '../copy/common.js';
import './DialogActions.css';

/**
 * @param {object} props
 * @param {() => void} props.onCancel
 * @param {{ label: string, onClick: () => void, disabled?: boolean }} props.primary
 * @param {boolean} [props.busy]  a save is in flight: both buttons wait.
 * @param {import('react').ReactNode} [props.note]  one quiet line on the left.
 * @param {string} [props.error]  shown above the buttons, announced.
 */
export default function DialogActions({ onCancel, primary, busy = false, note, error }) {
  return (
    <div className="dialog-actions">
      {error && <p className="dialog-actions-error" role="alert">{error}</p>}
      {note && <span className="dialog-actions-note">{note}</span>}
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>{COMMON.cancel}</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || primary.disabled} onClick={primary.onClick}>{primary.label}</button>
    </div>
  );
}

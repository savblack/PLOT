import { useEffect } from 'react';
import { useUndoToast } from '@plot/core/undo.js';
import { UNDO } from '@plot/core/copy/undo.js';
import { useApp } from '../hooks/useApp.js';
import './UndoToast.css';

/* The undo toast. What can be undone, what reverting does, and the toast's
   timing all live in @plot/core/undo.js; this draws it and adds the one
   DOM-only piece, Cmd/Ctrl+Z. Mobile draws the same toast in
   components/UndoToast.tsx. */

function isEditable(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export default function UndoToast() {
  // Optional chaining: the toast also renders outside the app shell (Storybook).
  const toast = useUndoToast({ region: useApp()?.profile?.region });
  const { offer, undo } = toast;

  // Cmd/Ctrl+Z while an offer is up, unless the user is typing: there it must
  // keep meaning "undo my typing".
  useEffect(() => {
    if (!offer) return undefined;
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (isEditable(document.activeElement)) return;
      e.preventDefault();
      undo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [offer, undo]);

  if (!toast.visible) return null;

  return (
    <div
      className={`undo-toast${toast.failed ? ' undo-toast--error' : ''}`}
      role="status"
      aria-live="polite"
      onMouseEnter={toast.pause}
      onMouseLeave={toast.resume}
      onFocus={toast.pause}
      onBlur={toast.resume}
    >
      <span className="undo-toast-message">{toast.message}</span>
      {offer && (
        <>
          <button type="button" className="btn btn-secondary btn-sm undo-toast-action" onClick={undo}>
            {UNDO.button}
          </button>
          <button type="button" className="undo-toast-close" aria-label={UNDO.dismiss} onClick={toast.dismiss}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

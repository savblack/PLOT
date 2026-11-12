import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import SheetHeader from './SheetHeader.jsx';
import './ResponsiveDialog.css';

/** Dialogs open right now, oldest first. */
const OPEN_DIALOGS = [];

/**
 * One responsive modal surface for short, focused web workflows.
 * Pointer-sized screens get a contained dialog; phones get the same content
 * as an inset, thumb-friendly sheet. Long-form media details remain panels.
 */
export default function ResponsiveDialog({
  title,
  /** The accessible name when `title` is an element rather than a string. */
  label,
  onClose,
  onBack,
  /** The header's close word: Cancel by default, Done for a picker that
   *  applies as you tap. */
  closeLabel,
  children,
  footer,
  size = 'default',
  tall = false,
  contentClassName = '',
  surfaceClassName = '',
  zIndex = 1000,
}) {
  const surfaceRef = useRef(null);
  const restoreFocusRef = useRef(null);
  // The latest onClose, so the open effect below runs once per opening. With
  // onClose as its dependency, a parent re-rendering while the dialog was open
  // (an inline handler, a list that reloads) re-ran it and pulled focus back
  // to the opener.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    // Only the dialog on top answers Escape and traps Tab, so a dialog opened
    // over another closes alone.
    const entry = {};
    OPEN_DIALOGS.push(entry);
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (OPEN_DIALOGS[OPEN_DIALOGS.length - 1] !== entry) return;
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = surfaceRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      const at = OPEN_DIALOGS.indexOf(entry);
      if (at !== -1) OPEN_DIALOGS.splice(at, 1);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  const sizeClass = size === 'compact'
    ? ' responsive-dialog--compact'
    : size === 'wide'
      ? ' responsive-dialog--wide'
      : '';

  const dialog = (
    <div
      className="responsive-dialog-overlay"
      style={{ zIndex }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={surfaceRef}
        className={`responsive-dialog${sizeClass}${tall ? ' responsive-dialog--tall' : ''}${surfaceClassName ? ` ${surfaceClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label || (typeof title === 'string' ? title : undefined)}
      >
        <div className="responsive-dialog-handle" aria-hidden="true" />
        <SheetHeader title={title} onClose={onClose} onBack={onBack} closeLabel={closeLabel} />
        <div className={`responsive-dialog-content${contentClassName ? ` ${contentClassName}` : ''}`}>
          {children}
        </div>
        {footer && <footer className="responsive-dialog-footer">{footer}</footer>}
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

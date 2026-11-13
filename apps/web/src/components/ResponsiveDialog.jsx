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
  /** Where focus goes on close when the element that had it is gone (the
   *  dialog this one replaced took it with it). */
  returnFocusRef,
  /** Who to name the dialog by: `title` (default) or an element inside it
   *  (aria-labelledby), when the dialog's real headline is in its body. */
  labelledBy,
}) {
  const surfaceRef = useRef(null);
  const restoreFocusRef = useRef(null);
  // The latest onClose, so the open effect below runs once per opening. With
  // onClose as its dependency, a parent re-rendering while the dialog was open
  // (an inline handler, a list that reloads) re-ran it and pulled focus back
  // to the opener.
  const onCloseRef = useRef(onClose);
  const returnRef = useRef(returnFocusRef);
  useEffect(() => { onCloseRef.current = onClose; returnRef.current = returnFocusRef; });

  useEffect(() => {
    // Only the dialog on top answers Escape and traps Tab, so a dialog opened
    // over another closes alone.
    const entry = {};
    OPEN_DIALOGS.push(entry);
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus moves into the dialog: onto the dialog itself, unless something
    // inside already took it (an autofocused field). The surface is not a
    // tab stop, so no focus ring lands on a button the moment it opens.
    if (!surfaceRef.current?.contains(document.activeElement)) surfaceRef.current?.focus();

    const handleKeyDown = (event) => {
      if (OPEN_DIALOGS[OPEN_DIALOGS.length - 1] !== entry) return;
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        // Listened for first (capture) and stopped here, so a panel or page
        // underneath with its own Escape (the title panel) stays open.
        event.stopPropagation();
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
      // Focus can be on the dialog itself (it opens there), which is not in
      // the list: wrap from there too.
      const inList = [...focusable].includes(document.activeElement);
      if (event.shiftKey && (!inList || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inList || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      const at = OPEN_DIALOGS.indexOf(entry);
      if (at !== -1) OPEN_DIALOGS.splice(at, 1);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // The body means nothing held focus when it opened.
      const restore = restoreFocusRef.current;
      const usable = restore && restore !== document.body && restore.isConnected;
      (usable ? restore : returnRef.current?.current)?.focus?.();
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
        tabIndex={-1}
        aria-label={labelledBy ? undefined : label || (typeof title === 'string' ? title : undefined)}
        aria-labelledby={labelledBy}
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

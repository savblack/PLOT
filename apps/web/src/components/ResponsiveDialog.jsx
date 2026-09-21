import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import SheetHeader from './SheetHeader.jsx';
import './ResponsiveDialog.css';

/**
 * One responsive modal surface for short, focused web workflows.
 * Pointer-sized screens get a contained dialog; phones get the same content
 * as an inset, thumb-friendly sheet. Long-form media details remain panels.
 */
export default function ResponsiveDialog({
  title,
  onClose,
  onBack,
  action,
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

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [onClose]);

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
        aria-label={title}
      >
        <div className="responsive-dialog-handle" aria-hidden="true" />
        <SheetHeader title={title} onClose={onClose} onBack={onBack} action={action} />
        <div className={`responsive-dialog-content${contentClassName ? ` ${contentClassName}` : ''}`}>
          {children}
        </div>
        {footer && <footer className="responsive-dialog-footer">{footer}</footer>}
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

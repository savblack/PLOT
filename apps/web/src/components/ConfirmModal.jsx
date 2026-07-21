import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * ConfirmModal — replaces window.confirm() with a styled, accessible modal.
 * Works in web (via createPortal) and can be adapted for React Native (swap
 * createPortal for Modal from react-native).
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null);
 *   // trigger: setConfirm({ message: '…', onConfirm: () => doThing() })
 *   {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
 */
export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!submitting) onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

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
  }, [onClose, submitting]);

  const handleConfirm = async () => {
    if (submitting) return;

    try {
      setSubmitting(true);
      const result = onConfirm ? await onConfirm() : true;
      if (result !== false) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <>
      {/* Overlay */}
      <div
        onClick={() => { if (!submitting) onClose(); }}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
          animation: 'confirmFadeIn 0.15s ease',
        }}
      >
        {/* Card */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={messageId}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            width: '100%',
            maxWidth: '360px',
            boxShadow: 'var(--shadow-overlay)',
            animation: 'confirmSlideUp 0.18s var(--ease)',
          }}
        >
          {title && (
            <p id={titleId} style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.15rem',
              fontWeight: 400,
              color: 'var(--text-primary)',
              marginBottom: '0.5rem',
              lineHeight: 1.25,
            }}>
              {title}
            </p>
          )}
          <p id={messageId} style={{
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}>
            {message}
          </p>
          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
            <button
              ref={cancelRef}
              onClick={onClose}
              disabled={submitting}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-strong)',
                borderRadius: '9999px',
                padding: '0.55rem 1.1rem',
                fontSize: '0.8rem',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                background: danger ? '#dc2626' : 'var(--accent)',
                border: 'none',
                borderRadius: '9999px',
                padding: '0.55rem 1.1rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                color: '#fff',
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              {submitting ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes confirmFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes confirmSlideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </>
  );

  // createPortal keeps it on web; swap for <Modal> from react-native when porting
  return typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal;
}

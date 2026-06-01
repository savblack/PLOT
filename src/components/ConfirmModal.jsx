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
  const handleConfirm = () => { onConfirm(); onClose(); };

  const modal = (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
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
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            width: '100%',
            maxWidth: '360px',
            boxShadow: 'var(--shadow-lg)',
            animation: 'confirmSlideUp 0.18s var(--ease)',
          }}
        >
          {title && (
            <p style={{
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
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}>
            {message}
          </p>
          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
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
              onClick={handleConfirm}
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
              {confirmLabel}
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

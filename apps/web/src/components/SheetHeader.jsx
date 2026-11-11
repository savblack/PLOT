/**
 * One header for every modal / pop-up across the web app, so they stay
 * consistent in alignment, type size, and padding — mirrors the mobile
 * app's <SheetHeader>.
 *
 * A centred Gabarito title (1.4rem), ✕ close on the right, and a back-chevron
 * on the left when there is somewhere to go back to. The header carries no
 * Save or other action: a dialog's main button is in its foot, bottom right
 * (DialogActions.jsx), so it is in the same place in every dialog. The title
 * is absolutely centred so it sits mid-header whichever sides carry buttons.
 * `bordered` (default true) draws the hairline divider.
 */

const ICON_BTN = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 44, height: 34, padding: 0,
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)',
};

export default function SheetHeader({ title, onClose, onBack, bordered = true }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        minHeight: 56, padding: '0.9rem 1.1rem',
        borderBottom: bordered ? '1px solid var(--border)' : 'none',
        flexShrink: 0,
      }}
    >
      {/* Left slot: the back chevron, when there is somewhere to go back to. */}
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" style={ICON_BTN}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      ) : <span style={{ minWidth: 44 }} />}

      <h2
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 56, right: 56,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: 0, pointerEvents: 'none', textAlign: 'center',
          fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {title}
      </h2>

      {/* Right slot: ✕. Close is always top right (design audit, 10 Nov 2026,
          pick 1.2 A). */}
      <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', zIndex: 1 }}>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" style={ICON_BTN}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

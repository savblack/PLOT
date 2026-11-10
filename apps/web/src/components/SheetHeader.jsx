/**
 * One header for every modal / pop-up across the web app, so they stay
 * consistent in alignment, type size, and padding — mirrors the mobile
 * app's <SheetHeader>.
 *
 * A centred Gabarito title (1.4rem). With no primary action, ✕ close sits on the
 * right (or a back-chevron on the left, if supplied). When a primary action
 * (e.g. Save) is present, the action moves to the right and ✕ close (or the
 * back-chevron) takes the left slot. The title is absolutely centred so it
 * sits mid-header and screen-centred regardless of which sides carry buttons.
 * `bordered` (default true) draws the hairline divider.
 */

const ICON_BTN = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 44, height: 34, padding: 0,
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)',
};

export default function SheetHeader({ title, onClose, onBack, action, bordered = true }) {
  const actionBtn = action && (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      style={{
        background: 'none', border: 'none', cursor: action.disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 700,
        color: action.disabled ? 'var(--text-muted)' : 'var(--accent)',
        padding: 0,
      }}
    >
      {action.label}
    </button>
  );

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

      {/* Right slot: the primary action (e.g. Save), if any, then ✕. Close is
          always top right, whatever else the header carries (design audit,
          10 Nov 2026, pick 1.2 A). It used to move to the left when an action
          took the right. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: 'auto', zIndex: 1 }}>
        {actionBtn}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" style={ICON_BTN}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

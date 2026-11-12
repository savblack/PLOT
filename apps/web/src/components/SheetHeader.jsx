import { COMMON } from '@plot/core/copy/common.js';

/**
 * One header for every modal / pop-up across the web app, matching the
 * mobile app's (apps/mobile/components/ModalHeader.tsx and BottomSheet.tsx).
 *
 * The title on the left in Gabarito, and the word Cancel on the right
 * (Savannah, 12 Nov 2026: both apps close a pop-up with Cancel, title left;
 * this replaces the centred title and ✕ from the 10 Nov design audit). A
 * back-chevron sits before the title when there is somewhere to go back to.
 * The header carries no Save or other action: a dialog's main button is in
 * its foot, bottom right (DialogActions.jsx). `closeLabel` swaps the word
 * for a picker that applies as you tap (Done). `bordered` (default true)
 * draws the hairline divider.
 */

const BACK_BTN = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, padding: 0, marginLeft: -8, flexShrink: 0,
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)',
};

const CLOSE_BTN = {
  flexShrink: 0, minHeight: 34, padding: '0 2px',
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: '1rem', fontWeight: 500,
  color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};

export default function SheetHeader({ title, onClose, onBack, closeLabel = COMMON.cancel, bordered = true }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        minHeight: 56, padding: '0.9rem 1.25rem',
        borderBottom: bordered ? '1px solid var(--border)' : 'none',
        flexShrink: 0,
      }}
    >
      {onBack && (
        <button type="button" onClick={onBack} aria-label={COMMON.back} style={BACK_BTN}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}

      <h2
        style={{
          flex: 1, minWidth: 0, margin: 0,
          fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {title}
      </h2>

      {onClose && (
        <button type="button" onClick={onClose} style={CLOSE_BTN}>
          {closeLabel}
        </button>
      )}
    </div>
  );
}

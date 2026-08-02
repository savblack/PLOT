import { useState } from 'react';

/**
 * Generic "···" trigger + dropdown, for a small set of row/header actions.
 * Mirrors the per-list menu in MyListsView's CustomListsSection (same
 * trigger, same panel look) so every overflow menu in the app behaves the
 * same way.
 */
export default function KebabMenu({ ariaLabel = 'Open menu', items }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="kebab-menu">
      <button
        type="button"
        className="list-options-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        ···
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div className="kebab-menu-panel">
            {items.map(item => (
              <button
                key={item.label}
                type="button"
                className={`kebab-menu-item${item.danger ? ' kebab-menu-item--danger' : ''}`}
                onClick={() => { item.onClick(); setOpen(false); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

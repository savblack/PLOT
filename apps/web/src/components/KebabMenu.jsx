import { useState } from 'react';

/**
 * Generic "···" trigger + dropdown, for a small set of row/header actions.
 * Mirrors the per-list menu in MyListsView's CustomListsSection (same
 * trigger, same panel look) so every overflow menu in the app behaves the
 * same way.
 */
export default function KebabMenu({ ariaLabel = 'Open menu', items, trigger = '···', buttonClassName = 'list-options-btn' }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="kebab-menu">
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        {trigger}
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
                // Items with `checked` are one choice from a set (a list's visibility).
                {...(item.checked === undefined ? {} : { role: 'menuitemradio', 'aria-checked': item.checked })}
                title={item.hint}
                onClick={() => { item.onClick(); setOpen(false); }}
              >
                {item.label}
                {item.checked && <span aria-hidden="true" className="kebab-menu-check"> ✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

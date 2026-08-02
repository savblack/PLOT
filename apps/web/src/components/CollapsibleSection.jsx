import { useCallback, useState } from 'react';
import { getStoredSectionOpen, storeSectionOpen } from '../utils/sectionOpenState.js';

/**
 * Shared collapsible section banner used across list-style views (My Lists,
 * Discover, Guide, …). One fixed-height banner — chevron, label, optional
 * count — over an animated body. Open state persists per `id` so a collapsed
 * group stays collapsed across tab switches and reloads.
 */
export default function CollapsibleSection({ id, label, count, defaultOpen = true, open, onOpenChange, headerRight, children }) {
  const [storedOpen, setStoredOpen] = useState(() => getStoredSectionOpen(id, defaultOpen));
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : storedOpen;

  const toggle = useCallback(() => {
    const next = !isOpen;
    storeSectionOpen(id, next);
    if (!isControlled) {
      setStoredOpen(next);
    }
    onOpenChange?.(next);
  }, [id, isControlled, isOpen, onOpenChange]);

  return (
    <section className="collapse-section" id={id}>
      <div className="collapse-head">
        <button
          type="button"
          className="collapse-head-toggle"
          aria-expanded={isOpen}
          onClick={toggle}
        >
          <svg className={`collapse-chevron${isOpen ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="collapse-label">{label}</span>
          {count != null && <span className="collapse-count">{count}</span>}
        </button>
        {headerRight && <div className="collapse-head-actions">{headerRight}</div>}
      </div>
      <div className={`collapse-body${isOpen ? '' : ' collapsed'}`}>
        <div className="collapse-body-inner">{children}</div>
      </div>
    </section>
  );
}

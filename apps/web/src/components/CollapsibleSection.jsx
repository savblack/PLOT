import { useCallback, useState } from 'react';

/**
 * Shared collapsible section banner used across list-style views (My Lists,
 * Discover, Guide, …). One fixed-height banner — chevron, label, optional
 * count — over an animated body. Open state persists per `id` so a collapsed
 * group stays collapsed across tab switches and reloads.
 */
function readStored(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export default function CollapsibleSection({ id, label, count, defaultOpen = true, children }) {
  const storageKey = `plot.section.${id}`;
  const [open, setOpen] = useState(() => readStored(storageKey, defaultOpen));

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  }, [storageKey]);

  return (
    <section className="collapse-section">
      <button
        type="button"
        className="collapse-head"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg className={`collapse-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="collapse-label">{label}</span>
        {count != null && <span className="collapse-count">{count}</span>}
      </button>
      <div className={`collapse-body${open ? '' : ' collapsed'}`}>
        <div className="collapse-body-inner">{children}</div>
      </div>
    </section>
  );
}

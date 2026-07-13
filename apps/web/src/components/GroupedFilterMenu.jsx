import { useEffect, useRef, useState } from 'react';

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export default function GroupedFilterMenu({ ariaLabel = 'Filter', groups }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const visibleGroups = groups.filter(group => group.options.length > 0);

  const toggleValue = (value, values, onChange) => {
    onChange(values.includes(value)
      ? values.filter(v => v !== value)
      : [...values, value]);
  };

  return (
    <div className="guide-filter" ref={ref}>
      <button
        className={`guide-filter-btn${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        type="button"
      >
        <FilterIcon />
      </button>
      {open && (
        <div className="guide-filter-menu">
          {visibleGroups.map(group => (
            <div key={group.heading} className="guide-filter-group">
              <div className="guide-filter-heading">{group.heading}</div>
              {group.options.map(opt => (
                <label key={opt.id} className="guide-filter-option">
                  <input
                    type="checkbox"
                    checked={group.value.includes(opt.id)}
                    onChange={() => toggleValue(opt.id, group.value, group.onChange)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

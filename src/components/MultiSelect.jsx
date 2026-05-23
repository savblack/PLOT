import { useState, useEffect, useRef } from 'react';

export default function MultiSelect({ placeholder, options, value, onChange }) {
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

  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

  const label = value.length === 0
    ? placeholder
    : value.length === options.length
      ? placeholder
      : value.length === 1
        ? options.find(o => String(o.id) === String(value[0]))?.label ?? placeholder
        : `${value.length} selected`;

  return (
    <div className="multi-select" ref={ref}>
      <button
        className={`multi-select-btn${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        {label}
        <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="0 0 5 5 10 0" />
        </svg>
      </button>
      {open && (
        <div className="multi-select-menu">
          {options.map(opt => (
            <label key={opt.id} className="multi-select-option">
              <input
                type="checkbox"
                checked={value.includes(opt.id)}
                onChange={() => toggle(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

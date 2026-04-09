import { useState, useRef, useEffect } from 'react';
import { REGIONS } from '../../constants';

export default function StepRegion({ selectedRegion, setSelectedRegion }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div>
      <h1 className="onboarding-step-heading">Where are you based?</h1>
      <p className="onboarding-step-sub">
        Sets your streaming options and release dates.
      </p>
      <div className="onboarding-dropdown" ref={dropdownRef}>
        <button
          className={`onboarding-dropdown-trigger${dropdownOpen ? ' open' : ''}`}
          onClick={() => setDropdownOpen(v => !v)}
        >
          <span>{REGIONS.find(r => r.code === selectedRegion)?.name}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="onboarding-dropdown-menu">
            {REGIONS.map(r => (
              <button
                key={r.code}
                className={`onboarding-dropdown-item${selectedRegion === r.code ? ' selected' : ''}`}
                onClick={() => { setSelectedRegion(r.code); setDropdownOpen(false); }}
              >
                {r.name}
                <span className="onboarding-dropdown-code">{r.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

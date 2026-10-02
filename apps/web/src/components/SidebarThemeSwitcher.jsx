// Desktop sidebar: a compact theme switcher above the profile row. The Light /
// Dark / System control for everyone, then a ThemeChip per theme family. A Premium family applies at once for Premium
// viewers and shows a lock for Free ones, where a tap opens the upgrade sheet
// instead (it never applies or trials the family). DOM-only popover; mobile
// parity is https://github.com/savblack/PLOT/issues/1090.
import { useEffect, useId, useRef, useState } from 'react';
import { THEME_FAMILIES, THEME_MODES, isPremiumFamily } from '@plot/core/themes.js';
import ThemeChip from './ThemeChip.jsx';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import './SidebarThemeSwitcher.css';

const A = SETTINGS_VIEW.appearance;
const S = A.switcher;

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-switch-lock">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * @param {{
 *   mode: import('@plot/core/themes.js').ThemeMode,
 *   family: import('@plot/core/themes.js').ThemeFamily,
 *   onPickMode: (mode: import('@plot/core/themes.js').ThemeMode) => boolean,
 *   onPickFamily: (family: import('@plot/core/themes.js').ThemeFamily) => boolean,
 *   isPremium: boolean,
 *   onLocked: (family: string) => void,
 *   defaultOpen?: boolean,
 * }} props  onPickFamily returns false for a family the viewer cannot use;
 *   onLocked then opens the upgrade sheet for it. defaultOpen is for Storybook.
 */
export default function SidebarThemeSwitcher({ mode, family, onPickMode, onPickFamily, isPremium, onLocked, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const pickFamily = (id) => {
    if (onPickFamily(id)) return;
    setOpen(false);
    onLocked(id);
  };

  const currentName = A.families[family];

  return (
    <div className="theme-switch" ref={rootRef}>
      {open && (
        <div className="theme-switch-panel" id={panelId} role="group" aria-label={S.toggle}>
          <div className="theme-switch-head">
            <span className="theme-switch-title">{S.toggle}</span>
            <span className="theme-switch-scope">{S.thisBrowser}</span>
          </div>
          <div className="theme-switch-modes" role="group" aria-label={S.mode}>
            {THEME_MODES.map(m => (
              <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? 'is-active' : undefined} onClick={() => onPickMode(m)}>
                {A.modes[m]}
              </button>
            ))}
          </div>
          <div className="theme-switch-label">{A.themesLabel}</div>
          <div className="theme-switch-swatches" role="group" aria-label={A.themesOptionsLabel}>
            {THEME_FAMILIES.map(id => {
              const name = A.families[id];
              const locked = isPremiumFamily(id) && !isPremium;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={family === id}
                  aria-label={locked ? A.lockedTheme(name) : name}
                  title={name}
                  className={`theme-switch-swatch${family === id ? ' is-active' : ''}`}
                  onClick={() => pickFamily(id)}
                >
                  <ThemeChip family={id} selected={family === id} />
                  {locked && <LockIcon />}
                </button>
              );
            })}
          </div>
          <div className="theme-switch-current">{S.current(currentName, isPremiumFamily(family))}</div>
        </div>
      )}
      <button
        ref={toggleRef}
        type="button"
        className="app-sidebar-item theme-switch-toggle interactive-surface"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(o => !o)}
      >
        <ThemeChip family={family} size="sm" />
        <span className="app-sidebar-label">{S.toggle}</span>
        <span className="theme-switch-toggle-name app-sidebar-label">{currentName}</span>
      </button>
    </div>
  );
}

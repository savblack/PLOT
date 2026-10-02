// Desktop sidebar: the profile row at the foot of the rail opens this account
// menu. Top to bottom: the Light / Dark / System control, a ThemeChip per theme
// family, the account links, the "Help build Plot" links, then Sign out.
// A Premium family applies at once for Premium viewers and shows a lock for
// Free ones, where a tap opens the upgrade sheet instead (it never applies or
// trials the family). DOM-only popover; mobile parity is
// https://github.com/savblack/PLOT/issues/1090. Below the sidebar breakpoint
// the nav drawer has no account menu: Settings carries the same theme
// controls, feedback and Ko-fi links there.
import { useEffect, useId, useRef, useState } from 'react';
import { THEME_FAMILIES, THEME_MODES, isPremiumFamily } from '@plot/core/themes.js';
import ThemeChip from './ThemeChip.jsx';
import { IconSettings } from './navIcons.jsx';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { APP_SHELL } from '../copy/appShell.js';
import './AccountMenu.css';

const A = SETTINGS_VIEW.appearance;
const S = A.switcher;
const SUPPORT_URL = 'https://ko-fi.com/J7P123TYGK';
const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="account-menu-lock">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

function IconFeedback() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />
      <path d="M12 7.5v6M9 10.5h6" />
    </svg>
  );
}

function IconSupport() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 5.6a5.4 5.4 0 0 0-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7l8.8 8.7 8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
    </svg>
  );
}

/**
 * @param {{
 *   profile: { username: string, display_name?: string | null, avatar_url?: string | null },
 *   active?: boolean,
 *   settingsLabel: string,
 *   onViewProfile: () => void,
 *   onSettings: () => void,
 *   onFeedback: () => void,
 *   onSignOut: () => void,
 *   mode?: import('@plot/core/themes.js').ThemeMode,
 *   family?: import('@plot/core/themes.js').ThemeFamily,
 *   onPickMode?: (mode: import('@plot/core/themes.js').ThemeMode) => boolean,
 *   onPickFamily?: (family: import('@plot/core/themes.js').ThemeFamily) => boolean,
 *   isPremium: boolean,
 *   onLocked?: (family: string) => void,
 *   defaultOpen?: boolean,
 * }} props  active: the viewer is on their own profile. The theme section only
 *   renders when onPickFamily is given. onPickFamily returns false for a family
 *   the viewer cannot use; onLocked then opens the upgrade sheet for it.
 *   defaultOpen is for Storybook.
 */
export default function AccountMenu({
  profile,
  active = false,
  settingsLabel,
  onViewProfile,
  onSettings,
  onFeedback,
  onSignOut,
  mode,
  family,
  onPickMode,
  onPickFamily,
  isPremium,
  onLocked,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  // Set when the viewer opens the menu, so the Storybook-seeded open state
  // doesn't steal focus on render.
  const focusFirstRef = useRef(false);
  const panelId = useId();
  const helpId = `${panelId}-help`;

  const close = ({ returnFocus = false } = {}) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    if (focusFirstRef.current) {
      focusFirstRef.current = false;
      panelRef.current?.querySelector(ITEM_SELECTOR)?.focus();
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) focusFirstRef.current = true;
    setOpen(o => !o);
  };

  // Arrow keys walk every item in reading order; Home and End jump to the
  // ends. Tab also moves through the items, and leaving the menu closes it.
  const onPanelKeyDown = (e) => {
    const items = [...(panelRef.current?.querySelectorAll(ITEM_SELECTOR) ?? [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = items[(index + 1) % items.length];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = items[(index - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };

  const onRootBlur = (e) => {
    if (e.relatedTarget && !rootRef.current?.contains(e.relatedTarget)) setOpen(false);
  };

  const pickFamily = (id) => {
    if (onPickFamily(id)) return;
    // Focus the profile row first: the upgrade sheet returns focus to
    // whatever had it when it opened, and the chip is about to unmount.
    close({ returnFocus: true });
    onLocked?.(id);
  };

  // Items that leave the menu close it first; theme picks keep it open so the
  // viewer can try a few.
  const select = (fn) => { close(); fn?.(); };

  const name = profile.display_name || profile.username;

  return (
    <div className="account-menu" ref={rootRef} onBlur={onRootBlur}>
      {open && (
        <div
          ref={panelRef}
          className="account-menu-panel"
          id={panelId}
          role="menu"
          aria-label={APP_SHELL.accountMenu}
          onKeyDown={onPanelKeyDown}
        >
          {onPickFamily && (
            <div className="account-menu-appearance">
              <div className="account-menu-head" aria-hidden="true">
                <span className="account-menu-title">{S.mode}</span>
                <span className="account-menu-note">{S.thisBrowser}</span>
              </div>
              <div className="account-menu-modes" role="group" aria-label={`${S.mode}, ${S.thisBrowser}`}>
                {THEME_MODES.map(m => (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === m}
                    className={mode === m ? 'is-active' : undefined}
                    onClick={() => onPickMode(m)}
                  >
                    {A.modes[m]}
                  </button>
                ))}
              </div>
              <div className="account-menu-head" aria-hidden="true">
                <span className="account-menu-title">{A.themesLabel}</span>
                <span className="account-menu-note">{S.current(A.families[family], isPremiumFamily(family))}</span>
              </div>
              <div className="account-menu-swatches" role="group" aria-label={A.themesOptionsLabel}>
                {THEME_FAMILIES.map(id => {
                  const familyName = A.families[id];
                  const locked = isPremiumFamily(id) && !isPremium;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={family === id}
                      aria-label={locked ? A.lockedTheme(familyName) : familyName}
                      title={familyName}
                      className="account-menu-swatch"
                      onClick={() => pickFamily(id)}
                    >
                      <ThemeChip family={id} selected={family === id} />
                      {locked && <LockIcon />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="account-menu-section" role="group">
            <button type="button" role="menuitem" className="account-menu-item" onClick={() => select(onViewProfile)}>
              <IconProfile />
              {APP_SHELL.viewYourProfile}
            </button>
            <button type="button" role="menuitem" className="account-menu-item" onClick={() => select(onSettings)}>
              <IconSettings />
              {settingsLabel}
            </button>
          </div>

          <div className="account-menu-section" role="group" aria-labelledby={helpId}>
            <span className="account-menu-caption" id={helpId}>{APP_SHELL.helpBuild}</span>
            <button type="button" role="menuitem" className="account-menu-item" onClick={() => select(onFeedback)}>
              <IconFeedback />
              {APP_SHELL.giveFeedback}
            </button>
            <a
              role="menuitem"
              className="account-menu-item"
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${SETTINGS_VIEW.support.supportPlot} (${APP_SHELL.opensNewTab})`}
              onClick={() => close()}
            >
              <IconSupport />
              {SETTINGS_VIEW.support.supportPlot}
            </a>
          </div>

          <div className="account-menu-section" role="group">
            <button type="button" role="menuitem" className="account-menu-item account-menu-signout" onClick={() => select(onSignOut)}>
              {SETTINGS_VIEW.signOut}
            </button>
          </div>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={`app-sidebar-item app-sidebar-profile interactive-surface${active || open ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        {profile.avatar_url
          ? <img className="app-sidebar-avatar" src={profile.avatar_url} alt="" />
          : <span className="app-sidebar-avatar app-sidebar-avatar-initial">{name.charAt(0).toUpperCase()}</span>}
        <span className="app-sidebar-profile-copy"><span className="app-sidebar-label">{name}</span><small>{APP_SHELL.viewYourProfile}</small></span>
      </button>
    </div>
  );
}

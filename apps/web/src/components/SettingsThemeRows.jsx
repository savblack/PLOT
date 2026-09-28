// Settings > Profile & account: the Appearance (light/dark/system, free) and
// Themes (Premium palettes) rows. Web only for now: mobile parity is tracked
// in https://github.com/savblack/PLOT/issues/1090. Which themes exist and
// who may pick them come from @plot/core/themes.js; this file only renders.
import { PREMIUM_THEMES, BASE_THEMES, themeSwatch, isPremiumTheme } from '@plot/core/themes.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import './SettingsThemeRows.css';

const A = SETTINGS_VIEW.appearance;

/**
 * @param {{
 *   theme: import('@plot/core/themes.js').ThemeId,
 *   setTheme: (id: import('@plot/core/themes.js').ThemeId) => boolean,
 *   isPremium: boolean,
 *   onLocked: () => void,
 *   premiumBadge?: import('react').ReactNode,
 * }} props  onLocked: a Free viewer picked a Premium theme (open the upgrade sheet).
 */
export default function SettingsThemeRows({ theme, setTheme, isPremium, onLocked, premiumBadge }) {
  const pickTheme = (id) => {
    if (!setTheme(id)) onLocked();
  };

  return (
    <>
      <div className="settings-row" style={{ cursor: 'default' }}>
        <div className="settings-row-left">
          <div className="settings-row-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </div>
          <span className="settings-row-label">{A.label}</span>
        </div>
        <div className="settings-theme-tabs" role="tablist" aria-label={A.optionsLabel}>
          {BASE_THEMES.map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={theme === t}
              className={`settings-theme-tab${theme === t ? ' is-active' : ''}`}
              onClick={() => pickTheme(t)}
            >
              {A.modes[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row settings-theme-row" style={{ cursor: 'default' }}>
        <div className="settings-row-left">
          <div className="settings-row-icon">
            <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/></svg>
          </div>
          <div>
            <div className="settings-row-label">{A.themesLabel}{!isPremium && premiumBadge}</div>
            <div className="settings-theme-hint">{isPremium ? A.themesHint : A.themesLockedHint}</div>
          </div>
        </div>
        <div className="settings-theme-swatches" role="radiogroup" aria-label={A.themesOptionsLabel}>
          {PREMIUM_THEMES.map(id => {
            const swatch = themeSwatch(id);
            const name = A.themes[id];
            const selected = isPremiumTheme(theme) && theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={isPremium ? name : A.lockedTheme(name)}
                className={`settings-theme-swatch${selected ? ' is-active' : ''}`}
                onClick={() => pickTheme(id)}
              >
                <span
                  className="settings-theme-swatch-chip"
                  aria-hidden="true"
                  style={{ background: swatch.bg, borderColor: swatch.border }}
                >
                  <span style={{ background: swatch.surface, borderColor: swatch.border }} />
                  <span style={{ background: swatch.text }} />
                </span>
                <span className="settings-theme-swatch-name" aria-hidden="true">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

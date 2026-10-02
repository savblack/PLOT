// Settings > Profile & account: the Appearance row (Light / Dark / System,
// always free) and the Themes row (a ThemeChip per family; the default is
// free, the rest are Premium). Web only for
// now: mobile parity is tracked in https://github.com/savblack/PLOT/issues/1090.
// Which families exist and who may pick them come from @plot/core/themes.js;
// this file only renders.
import { THEME_FAMILIES, THEME_MODES, isPremiumFamily } from '@plot/core/themes.js';
import ThemeChip from './ThemeChip.jsx';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { regionalWords } from '../utils/spelling.js';
import { SettingsTextAction } from './SettingsPage.jsx';
import './SettingsThemeRows.css';

const A = SETTINGS_VIEW.appearance;

/**
 * @param {{
 *   mode: import('@plot/core/themes.js').ThemeMode,
 *   family: import('@plot/core/themes.js').ThemeFamily,
 *   setMode: (mode: import('@plot/core/themes.js').ThemeMode) => boolean,
 *   setFamily: (family: import('@plot/core/themes.js').ThemeFamily) => boolean,
 *   isPremium: boolean,
 *   onLocked: (family: string) => void,
 *   onPreview: () => void,
 *   region?: string | null,
 *   premiumBadge?: import('react').ReactNode,
 * }} props  onLocked: a Free viewer picked a Premium family (open the upgrade
 *   sheet with its preview). onPreview: open the Themes gallery (Premium only).
 *   region: the viewer's own profile region, for colour/color.
 */
export default function SettingsThemeRows({ mode, family, setMode, setFamily, isPremium, onLocked, onPreview, region, premiumBadge }) {
  const pickFamily = (id) => {
    if (!setFamily(id)) onLocked(id);
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
          {THEME_MODES.map(m => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`settings-theme-tab${mode === m ? ' is-active' : ''}`}
              onClick={() => setMode(m)}
            >
              {A.modes[m]}
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
            <div className="settings-theme-hint">{isPremium ? A.themesHint(regionalWords('color', region).nounLower) : A.themesLockedHint}</div>
          </div>
        </div>
        <div className="settings-theme-swatches" role="radiogroup" aria-label={A.themesOptionsLabel}>
          {THEME_FAMILIES.map(id => {
            const name = A.families[id];
            const selected = family === id;
            const locked = isPremiumFamily(id) && !isPremium;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={locked ? A.lockedTheme(name) : name}
                className={`settings-theme-swatch${selected ? ' is-active' : ''}`}
                onClick={() => pickFamily(id)}
              >
                <ThemeChip family={id} selected={selected} />
                <span className="settings-theme-swatch-name" aria-hidden="true">{name}</span>
              </button>
            );
          })}
          {isPremium && (
            <span className="settings-theme-preview">
              <SettingsTextAction onClick={onPreview} label={A.previewLabel}>{A.preview}</SettingsTextAction>
            </span>
          )}
        </div>
      </div>
    </>
  );
}

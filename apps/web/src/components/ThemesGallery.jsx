// Settings > Themes (/settings/themes): each theme family as a live light and
// dark pair, plus the Light / Dark / System control. A Premium viewer applies
// a family with a click; a Free viewer can look, and a Premium card opens the
// upgrade sheet with that family's preview instead of applying it (no trial,
// no session preview). Web only for now: mobile parity is
// https://github.com/savblack/PLOT/issues/1090.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { THEME_FAMILIES, THEME_MODES, isPremiumFamily } from '@plot/core/themes.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { useApp } from '../hooks/useApp.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { ThemeMiniaturePair } from './ThemeMiniature.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import './ThemesGallery.css';

const A = SETTINGS_VIEW.appearance;
const G = A.gallery;

export default function ThemesGallery() {
  const { profile, themeMode, themeFamily, setThemeMode, setThemeFamily } = useApp();
  const isPremium = isPremiumProfile(profile);
  const [locked, setLocked] = useState(null);

  const pick = (id) => {
    if (!setThemeFamily(id)) setLocked(id);
  };

  return (
    <div className="themes-gallery">
      <Link to="/settings?section=account" className="themes-back">{G.back}</Link>
      <div className="themes-head">
        <h2 className="themes-title">{G.title}</h2>
        <div className="settings-theme-tabs" role="tablist" aria-label={A.optionsLabel}>
          {THEME_MODES.map(m => (
            <button key={m} type="button" role="tab" aria-selected={themeMode === m} className={`settings-theme-tab${themeMode === m ? ' is-active' : ''}`} onClick={() => setThemeMode(m)}>
              {A.modes[m]}
            </button>
          ))}
        </div>
      </div>
      <p className="themes-intro">{G.intro}</p>
      {!isPremium && (
        <div className="themes-locked">
          <p>{G.lockedNote}</p>
          <Link to={premiumPlansPath('/settings/themes')} className="btn btn-primary btn-sm">{SETTINGS_VIEW.premium.upgradeButton}</Link>
        </div>
      )}
      <ul className="themes-grid" aria-label={A.themesOptionsLabel}>
        {THEME_FAMILIES.map(id => {
          const premium = isPremiumFamily(id);
          const inUse = themeFamily === id;
          const name = A.families[id];
          return (
            <li key={id}>
              <button
                type="button"
                className={`themes-card${inUse ? ' is-active' : ''}`}
                aria-pressed={inUse}
                aria-label={premium && !isPremium ? A.lockedTheme(name) : G.applyLabel(name)}
                onClick={() => pick(id)}
              >
                <ThemeMiniaturePair family={id} />
                <span className="themes-card-foot">
                  <span className="themes-card-name">{name}</span>
                  <span className={`themes-card-tag${inUse ? ' is-active' : ''}`}>
                    {inUse ? G.inUse : premium ? G.premium : G.free}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {locked && <UpgradeSheet reason="themes" family={locked} onClose={() => setLocked(null)} />}
    </div>
  );
}

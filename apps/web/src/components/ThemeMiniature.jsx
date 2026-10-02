// A small drawing of one theme family in one mode: its ground, one surface
// card and a single accent mark (the fill). Used by the Themes
// gallery and the upgrade sheet, so a viewer can see a theme without it being
// applied. Colours come from @plot/core/themes.js (themeColors), never from
// the page's own tokens, so it draws the theme it is given, not the one in use.
import { themeColors } from '@plot/core/themes.js';
import './ThemeMiniature.css';

function Scene({ family, mode }) {
  const c = themeColors(family, mode);
  const style = {
    '--m-bg': c.bg,
    '--m-surface': c.surface,
    '--m-border': c.border,
    '--m-fill': c.accentFill,
  };
  return (
    <span className="theme-mini-scene" style={style}>
      <span className="theme-mini-card"><span className="theme-mini-fill" /></span>
    </span>
  );
}

/**
 * One family in one mode.
 * @param {{ family: import('@plot/core/themes.js').ThemeFamily, mode: 'light' | 'dark', className?: string }} props
 */
export default function ThemeMiniature({ family, mode, className = '' }) {
  return (
    <span className={`theme-mini ${className}`.trim()} aria-hidden="true">
      <Scene family={family} mode={mode} />
    </span>
  );
}

/**
 * A family's light and dark miniatures side by side.
 * @param {{ family: import('@plot/core/themes.js').ThemeFamily, className?: string }} props
 */
export function ThemeMiniaturePair({ family, className = '' }) {
  return (
    <span className={`theme-mini-pair ${className}`.trim()} aria-hidden="true">
      <ThemeMiniature family={family} mode="light" />
      <ThemeMiniature family={family} mode="dark" />
    </span>
  );
}

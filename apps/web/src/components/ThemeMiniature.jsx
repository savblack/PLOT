// A small drawing of Plot in one theme family and mode: the sidebar, a heading, a row of
// posters, the accent fill and a line of accent type. Used by the Themes
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
    '--m-sunken': c.surfaceSunken,
    '--m-text': c.textPrimary,
    '--m-muted': c.textMuted,
    '--m-border': c.border,
    '--m-accent': c.accentText,
    '--m-fill': c.accentFill,
  };
  return (
    <span className="theme-mini-scene" style={style}>
      <span className="theme-mini-rail">
        <span className="theme-mini-logo" />
        <span className="theme-mini-nav is-active" />
        <span className="theme-mini-nav" />
        <span className="theme-mini-nav" />
      </span>
      <span className="theme-mini-main">
        <span className="theme-mini-title" />
        <span className="theme-mini-posters">
          <span /><span /><span /><span />
        </span>
        <span className="theme-mini-foot">
          <span className="theme-mini-fill" />
          <span className="theme-mini-line" />
        </span>
      </span>
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

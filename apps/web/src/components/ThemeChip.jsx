// The theme family chip ("A3 · Inset ring", Oct 2026), used by the Settings
// swatch row and the sidebar switcher: a 28px circle of the family's light
// ground, a hairline edge, and a 3px ring of its light accent fill just inside
// it. Selection is a 2px ring in the current accent with a 2px gap, drawn by
// the wrapper so nothing shifts. One component + one CSS block, so the chip
// design can be swapped in one place. The gallery keeps its light/dark
// miniatures (ThemeMiniature).
import { familySwatch } from '@plot/core/themes.js';
import './ThemeChip.css';

/**
 * @param {{ family: import('@plot/core/themes.js').ThemeFamily, selected?: boolean, size?: 'md' | 'sm' }} props
 */
export default function ThemeChip({ family, selected = false, size = 'md' }) {
  const { light } = familySwatch(family);
  return (
    <span className={`theme-chip theme-chip--${size}${selected ? ' is-selected' : ''}`} aria-hidden="true">
      <span className="theme-chip-face" style={{ '--chip-ground': light.bg, '--chip-ring': light.fill }} />
    </span>
  );
}

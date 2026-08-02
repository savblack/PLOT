// Documents apps/website/theme.css. Read-only — values live in theme.css alone
// and are enforced against @plot/core/tokens.js by `npm run tokens:marketing`.
// Edit theme.css to change a value; this file only renders it.

export default {
  title: 'Foundations/Tokens',
  parameters: { layout: 'padded' },
};

const swatches = (pairs) => {
  const row = document.createElement('div');
  row.className = 'sb-swatch-row';
  for (const [name, varName] of pairs) {
    const cell = document.createElement('div');
    cell.className = 'sb-swatch';
    const chip = document.createElement('div');
    chip.className = 'sb-swatch-chip';
    chip.style.background = `var(${varName})`;
    cell.appendChild(chip);
    cell.append(`${name} (${varName})`);
    row.appendChild(cell);
  }
  return row;
};

export const Colors = () =>
  swatches([
    ['Accent', '--accent'],
    ['Ink (CTA)', '--ink'],
    ['Background', '--bg'],
    ['Surface', '--surface'],
    ['Text', '--text'],
    ['Text secondary', '--text-secondary'],
    ['Dark', '--dark'],
    ['Success', '--success'],
  ]);

export const Typography = () => {
  const wrap = document.createElement('div');

  const serif = document.createElement('div');
  serif.className = 'sb-type-row';
  serif.innerHTML =
    '<div class="sb-type-label">--serif (Instrument Serif)</div>' +
    '<div style="font-family: var(--serif); font-size: 2.5rem; letter-spacing: var(--serif-tracking);">Your film &amp; TV companion</div>';

  const sans = document.createElement('div');
  sans.className = 'sb-type-row';
  sans.innerHTML =
    '<div class="sb-type-label">--sans (DM Sans)</div>' +
    '<div style="font-family: var(--sans); font-size: 1rem;">Everything you\'ve watched. Everything you want to watch.</div>';

  wrap.appendChild(serif);
  wrap.appendChild(sans);
  return wrap;
};

export const Radii = () => {
  const row = document.createElement('div');
  row.className = 'sb-swatch-row';
  for (const [name, varName] of [
    ['Badge', '--r-badge'],
    ['Medium', '--r-md'],
    ['Large', '--r-lg'],
    ['Pill', '--r-pill'],
  ]) {
    const cell = document.createElement('div');
    cell.className = 'sb-swatch';
    const chip = document.createElement('div');
    chip.className = 'sb-swatch-chip';
    chip.style.background = 'var(--accent-dim)';
    chip.style.borderRadius = `var(${varName})`;
    cell.appendChild(chip);
    cell.append(`${name} (${varName})`);
    row.appendChild(cell);
  }
  return row;
};

import { ICON_PATHS, FILLABLE_ICONS } from '@plot/core/icons.js';

/* The web renderer for the shared icon set in @plot/core/icons.js.

   Size and colour come from the surrounding CSS (width/height on the svg,
   `color` on the button), as they did for the inline drawings this replaces.
   `filled` is set on the path rather than the svg so a stylesheet rule like
   `.some-btn svg { fill: none }` cannot undo a solid state. */
export default function Icon({ name, filled = false, size, className, strokeWidth = 2, label }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  const solid = filled && FILLABLE_ICONS.has(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} fill={solid ? 'currentColor' : 'none'} />
    </svg>
  );
}

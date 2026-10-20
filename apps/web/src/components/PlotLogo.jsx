import { WORDMARK_EM, WORDMARK_PATH, WORDMARK_VIEWBOX } from '@plot/core/wordmark.js';

// The plot wordmark: lowercase Gabarito Bold outlines with the l's foot joined
// to the o (Oct 2026). It's vector paths, not live text, because the font
// can't set the join — never a raster image, punctuation or mascot. It still
// sizes like text: set fontSize via `style` or a `className` and the ink
// matches the old live word at that size. Pass `white` for dark or image
// backgrounds, or `inherit` to take the size and colour of the surrounding
// text (for swapping it into an existing styled element).
export default function PlotLogo({ className = '', white = false, inherit = false, style, ...props }) {
  return (
    <svg
      className={className}
      viewBox={WORDMARK_VIEWBOX}
      role="img"
      aria-label="plot"
      fill="currentColor"
      style={{
        display: 'inline-block',
        fontSize: inherit ? '1em' : '1.65rem',
        height: `${WORDMARK_EM.height}em`,
        width: `${WORDMARK_EM.width}em`,
        verticalAlign: `-${WORDMARK_EM.descent}em`,
        overflow: 'visible',
        flexShrink: 0,
        color: white ? '#fff' : inherit ? 'inherit' : 'var(--text-primary)',
        // .btn svg is the icon rule: 14px, stroked, fill none. That erases the
        // wordmark inside "Join plot for free". Inline fill wins over it.
        fill: 'currentColor',
        stroke: 'none',
        ...style,
      }}
      {...props}
    >
      <path d={WORDMARK_PATH} />
    </svg>
  );
}

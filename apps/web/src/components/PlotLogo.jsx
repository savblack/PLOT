// The plot wordmark: the plain lowercase word in Gabarito bold, never a raster
// image and never with punctuation or a mascot (both were tried and declined in
// the Sept 2026 brand pass). Size it with fontSize via `style` or a
// `className`; pass `white` for dark or image backgrounds.
export default function PlotLogo({ className = '', white = false, style, ...props }) {
  return (
    <span
      className={className}
      aria-label="plot"
      style={{
        fontFamily: "var(--font-display, 'Gabarito', 'DM Sans', system-ui, sans-serif)",
        fontWeight: 700,
        fontSize: '1.65rem',
        letterSpacing: '-0.045em',
        lineHeight: 1,
        color: white ? '#fff' : 'var(--text-primary)',
        ...style,
      }}
      {...props}
    >
      plot
    </span>
  );
}

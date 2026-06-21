// The PLOT wordmark. Rendered as Instrument Serif text (var(--font-serif)), never
// a raster image — see the design system "Icon and mark usage" note. Size it with
// fontSize via `style` or a `className`; pass `white` for dark backgrounds.
export default function PlotLogo({ className = '', white = false, style, ...props }) {
  return (
    <span
      className={className}
      aria-label="PLOT"
      style={{
        fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
        fontWeight: 400,
        fontSize: '1.7rem',
        letterSpacing: '-0.05em',
        lineHeight: 1,
        color: white ? '#fff' : 'var(--text-primary)',
        ...style,
      }}
      {...props}
    >
      PLOT
    </span>
  );
}

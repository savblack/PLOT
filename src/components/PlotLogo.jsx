export default function PlotLogo({ className = '', alt = 'PLOT', white = false, style, ...props }) {
  return (
    <img
      src={white ? '/PLOT-white.png' : '/PLOT.png'}
      alt={alt}
      className={className}
      style={style}
      {...props}
    />
  );
}

import './PlotLoader.css';

const LETTERS = ['P', 'L', 'O', 'T'];

const SIZE_MAP = {
  xs: 8,
  sm: 12,
  md: 20,
  lg: 28,
  button: 8,
};

function resolveTone(tone) {
  if (tone !== 'auto') return tone;
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

function resolveSize(size) {
  if (typeof size === 'number') return size;
  return SIZE_MAP[size] ?? SIZE_MAP.lg;
}

export default function PlotLoader({
  size = 'lg',
  tone = 'auto',
  label = 'Loading',
  ariaHidden = false,
  className = '',
  style,
}) {
  const fontSize = resolveSize(size);
  const color = resolveTone(tone) === 'dark' ? '#ffffff' : '#0a0a0a';
  const classes = ['plot-loader', className].filter(Boolean).join(' ');
  const ariaProps = ariaHidden
    ? { 'aria-hidden': true }
    : { role: 'img', 'aria-label': label };

  return (
    <span
      className={classes}
      style={{
        '--plot-loader-font-size': `${fontSize}px`,
        '--plot-loader-color': color,
        ...style,
      }}
      {...ariaProps}
    >
      {LETTERS.map((letter, i) => (
        <span key={i} className="plot-loader__letter">{letter}</span>
      ))}
    </span>
  );
}

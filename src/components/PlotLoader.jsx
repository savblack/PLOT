const BLACK_LETTERS = [
  { key: 'p', src: '/P.png' },
  { key: 'l', src: '/L.png' },
  { key: 'o', src: '/O.png' },
  { key: 't', src: '/T.png' },
];

const WHITE_LETTERS = [
  { key: 'p', src: '/P-white.png' },
  { key: 'l', src: '/L-white.png' },
  { key: 'o', src: '/O-white.png' },
  { key: 't', src: '/T-white.png' },
];

const SIZE_MAP = {
  xs: 9,
  sm: 14,
  md: 24,
  lg: 36,
  button: 9,
};

function resolveTone(tone) {
  if (tone !== 'auto') return tone;
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

function resolveHeight(size) {
  if (typeof size === 'number') return size;
  return SIZE_MAP[size] ?? SIZE_MAP.lg;
}

function scale(value, height) {
  return `${Number(((value / 74) * height).toFixed(2))}px`;
}

export default function PlotLoader({
  size = 'lg',
  tone = 'auto',
  label = 'Loading',
  ariaHidden = false,
  className = '',
  style,
}) {
  const height = resolveHeight(size);
  const letters = resolveTone(tone) === 'dark' ? WHITE_LETTERS : BLACK_LETTERS;
  const classes = ['plot-loader', className].filter(Boolean).join(' ');
  const ariaProps = ariaHidden
    ? { 'aria-hidden': true }
    : { role: 'img', 'aria-label': label };

  return (
    <span
      className={classes}
      style={{
        '--plot-loader-letter-height': `${height}px`,
        '--plot-loader-letter-o-height': scale(76, height),
        '--plot-loader-p-gap': scale(6, height),
        '--plot-loader-l-gap': scale(-7, height),
        '--plot-loader-o-gap': scale(-5, height),
        ...style,
      }}
      {...ariaProps}
    >
      {letters.map(({ key, src }) => (
        <span key={key} className={`plot-loader__letter plot-loader__letter--${key}`}>
          <img src={src} alt="" aria-hidden="true" />
        </span>
      ))}
    </span>
  );
}

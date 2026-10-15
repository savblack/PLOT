import { WORDMARK_INK_HEIGHT, WORDMARK_LETTERS, WORDMARK_TOP } from '../core/wordmark.js';
import './PlotLoader.css';

// The wordmark loader: the plot wordmark outlines (l joined to the o), each
// letter rising into place in sequence, with a thin bar sweeping underneath.
// Loops until the content lands. Takes the theme from data-theme on <html>
// unless told otherwise.

const SIZE_MAP = { xs: 10, sm: 14, md: 22, lg: 30, button: 10 };

function resolveTone(tone) {
  if (tone !== 'auto') return tone;
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
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
  const color = resolveTone(tone) === 'dark' ? '#f8f2ea' : '#292924';
  const classes = ['plot-loader', className].filter(Boolean).join(' ');
  const ariaProps = ariaHidden ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  return (
    <span
      className={classes}
      style={{ '--plot-loader-font-size': `${fontSize}px`, '--plot-loader-color': color, ...style }}
      {...ariaProps}
    >
      <span className="plot-loader__word">
        {WORDMARK_LETTERS.map(({ letter, path, x0, x1 }) => {
          const width = x1 - x0;
          return (
            <svg
              key={letter}
              className="plot-loader__letter"
              viewBox={`${x0} ${WORDMARK_TOP} ${width} ${WORDMARK_INK_HEIGHT}`}
              style={{ width: `${width / 1000}em`, height: `${WORDMARK_INK_HEIGHT / 1000}em`, overflow: 'hidden' }}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={path} />
            </svg>
          );
        })}
      </span>
      <span className="plot-loader__bar" />
    </span>
  );
}

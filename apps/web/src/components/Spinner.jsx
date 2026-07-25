const SIZE_MAP = {
  xs: 12,
  sm: 14,
  md: 18,
  button: 14,
};

export default function Spinner({
  size = 'sm',
  label = 'Loading',
  ariaHidden = false,
  className = '',
  style,
}) {
  const px = typeof size === 'number' ? size : (SIZE_MAP[size] ?? SIZE_MAP.sm);
  const classes = ['spinner', className].filter(Boolean).join(' ');
  const ariaProps = ariaHidden
    ? { 'aria-hidden': true }
    : { role: 'img', 'aria-label': label };

  return (
    <span
      className={classes}
      style={{ width: `${px}px`, height: `${px}px`, ...style }}
      {...ariaProps}
    />
  );
}

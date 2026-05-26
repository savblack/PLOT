export default function Skeleton({ width, height, radius, style, className = '' }) {
  return (
    <div
      className={`sk${className ? ' ' + className : ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

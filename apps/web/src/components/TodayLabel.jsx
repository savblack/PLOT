/* ── Today label for view headers ("Fri, May 22") ── */
export function TodayLabel({ onClick }) {
  const label = new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <span
      onClick={onClick}
      className={`today-label${onClick ? ' today-label--clickable' : ''}`}
    >
      {label}
    </span>
  );
}

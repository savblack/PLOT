/* ── Countdown chip helper ───────────── */
export function countdownChip(dateStr) {
  if (!dateStr) return null;
  // Parse YYYY-MM-DD as local midnight to avoid UTC offset shifting the date
  const [y, m, day] = dateStr.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(y, m - 1, day);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0)   return { label: 'Released',    cls: 'chip-muted' };
  if (diff === 0) return { label: 'Today',        cls: 'chip-today' };
  if (diff === 1) return { label: 'Tomorrow',     cls: 'chip-tomorrow' };
  if (diff <= 7)  return { label: `${diff} days`, cls: 'chip-soon' };
  const fmt = new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return { label: fmt, cls: 'chip-muted' };
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

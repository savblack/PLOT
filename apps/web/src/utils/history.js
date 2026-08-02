export function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function entryMonthKey(entry) {
  if (!entry?.watched_at) return null;
  const d = new Date(entry.watched_at);
  return monthKey(d.getFullYear(), d.getMonth());
}

export function monthLabel(year, month, format = 'long') {
  return new Date(year, month, 1).toLocaleDateString('en', {
    month: format,
    year: 'numeric',
  });
}

export function entriesForMonth(entries, year, month) {
  const selectedMonth = monthKey(year, month);
  return entries.filter(entry => entryMonthKey(entry) === selectedMonth);
}

/**
 * Buckets entries by watched month, skipping months with nothing in them.
 * Assumes `entries` is already sorted newest-first (as useHistory returns
 * it) — groups come out in that same newest-month-first order for free,
 * since the first time a month is seen nothing more recent remains unseen.
 */
export function groupEntriesByMonth(entries) {
  const groups = [];
  const byKey = new Map();
  for (const entry of entries) {
    const key = entryMonthKey(entry);
    if (key == null) continue;
    let group = byKey.get(key);
    if (!group) {
      const watched = new Date(entry.watched_at);
      group = { year: watched.getFullYear(), month: watched.getMonth(), key, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

export function historyMonthEmptyCopy({ year, month, isCurrentMonth }) {
  const title = `Nothing in ${monthLabel(year, month)}`;
  const body = isCurrentMonth
    ? 'Try another month or mark a title as watched to start filling your history.'
    : 'Try another month, or tap Today to jump back to your latest activity.';

  return { title, body };
}

export function historyRatingLabel(value) {
  if (!value) return '';

  const stars = value / 2;
  return `${Number.isInteger(stars) ? stars.toFixed(0) : stars.toFixed(1)} ★`;
}

import { releaseCountdown } from '@plot/core/countdown.js';

/* ── Countdown tag ──────────────────── */
// The words and stages come from @plot/core/countdown.js (shared with iPhone);
// this only picks the Tag tone. Today is green, the next week amber, the rest
// neutral. `upcoming` is false for released and far-off dates.
const TONE = { today: 'success', tomorrow: 'warning', soon: 'warning', past: 'neutral', later: 'neutral' };
export function countdownChip(dateStr) {
  const c = releaseCountdown(dateStr);
  if (!c) return null;
  return { label: c.label, tone: TONE[c.stage], stage: c.stage, upcoming: TONE[c.stage] !== 'neutral' };
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

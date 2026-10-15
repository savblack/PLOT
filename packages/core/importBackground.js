// What a background import may write without asking. Pure, so the worker
// bundle (importEngine.js) and the apps share it without pulling in React.
import { needsDuplicateReview } from './importEvents.js';

/**
 * Split resolved entries into what the worker can write on its own and what
 * has to wait for the user. Both apps' preview step shows the same groups, so
 * a background import never writes anything the preview would have asked about.
 *
 * - ready: matched, no duplicate question.
 * - review: an unmatched title with candidates to choose from, or a possible
 *   duplicate. Kept for the import page's preview step.
 * - leftOut: nothing to offer (no search results, or the lookup failed).
 *
 * @param {any[]} resolved
 * @returns {{ ready: any[], review: any[], leftOut: any[] }}
 */
export function splitImportForBackground(resolved) {
  const ready = [];
  const review = [];
  const leftOut = [];
  for (const entry of resolved) {
    if (entry.status === 'matched' && !needsDuplicateReview(entry)) ready.push(entry);
    else if (needsDuplicateReview(entry) || (entry.candidates || []).length) review.push(entry);
    else leftOut.push(entry);
  }
  return { ready, review, leftOut };
}

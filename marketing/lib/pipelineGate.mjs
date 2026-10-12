// Decisions the weekly batch and the daily top-up share.
//
// Card posts (anything in POST_TYPES) are not queued until both crops exist in
// `media`. Questions and guides are not card posts: a question is text-only,
// a guide is the website article and never gets a social card.
import { POST_TYPES } from './post-types.mjs';
import { QUESTIONS_ENABLED } from '../planner/cadence.mjs';

const EARLY = new Set(['copy_ready', 'generated', 'failed']);
const OPEN = new Set(['copy_ready', 'generated', 'failed', 'needs_review', 'approved']);

export const postNeedsCards = (post) => !!post?.post_type && post.post_type in POST_TYPES;

export const postHasCards = (post) =>
  Array.isArray(post?.media) && post.media.some((m) => m?.portrait_path && m?.landscape_path);

/**
 * Why schedule.mjs must not push this post, or null when it may go to Buffer.
 * A missing card stays `queued` so the next render can fill it. Guides are
 * not blocked: they are not supposed to have cards. Question posts are off
 * and return `questions_off` so Buffer never receives one.
 *
 * @param {object} post
 * @returns {'missing_cards' | 'questions_off' | null}
 */
export const queueBlockReason = (post) => {
  if (post?.post_type === 'question' && !QUESTIONS_ENABLED) return 'questions_off';
  return postNeedsCards(post) && !postHasCards(post) ? 'missing_cards' : null;
};

/**
 * What generate.mjs should do with one row.
 *
 * `generate` renders (or, for a question or guide, finishes the row without a
 * card). `promote` is a row that already has its cards and only needs the
 * status flip. `skip` leaves it alone, including an approved question and an
 * approved guide, which are already past this step.
 *
 * An approved card post with no media is `generate`, and it stays approved.
 * The article decision is already made. Rendering must not send it back to
 * needs_review.
 *
 * @param {object} post
 * @returns {'generate' | 'promote' | 'skip'}
 */
export const renderAction = (post) => {
  if (!post?.copy || !OPEN.has(post.status)) return 'skip';
  if (post.post_type === 'question') {
    if (!QUESTIONS_ENABLED) return 'skip';
    return EARLY.has(post.status) ? 'generate' : 'skip';
  }
  if (post.post_type === 'guide') {
    return EARLY.has(post.status) ? 'generate' : 'skip';
  }
  if (!postNeedsCards(post)) return 'skip';
  if (postHasCards(post)) return EARLY.has(post.status) ? 'promote' : 'skip';
  return 'generate';
};

/** Status to write after a successful render. Approval is not undone. */
export const nextStatus = (post) => (post?.status === 'approved' ? 'approved' : 'needs_review');

/**
 * How the weekly runner treats `save.mjs`.
 *
 * Exit 1 means some files were rejected and the script itself finished. The
 * posts that saved are `copy_ready` and must still be rendered and queued.
 * The runner fails the workflow afterwards so the rejected copy is visible.
 * Any other non-zero exit is a broken save (database, crash) and must abort
 * before rendering.
 *
 * @param {number | null} status
 * @returns {'continue' | 'continue_and_fail' | 'abort'}
 */
export const saveExitAction = (status) => {
  if (status === 0) return 'continue';
  if (status === 1) return 'continue_and_fail';
  return 'abort';
};

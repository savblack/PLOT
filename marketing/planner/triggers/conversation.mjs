// Text-only question post (Threads + X): a generic, evergreen conversation
// starter — never tied to a specific title or what's trending. The worker writes
// the actual question; the payload just marks it as a general question.
import { isoDate } from '../../lib/dates.mjs';

export const evaluate = async (ctx) => {
  return {
    post_type: 'question',
    topic_key: `conversation:${isoDate(ctx.publishAt)}`,
    tmdb_refs: [],
    payload: { topic: { mode: 'generic' } },
  };
};

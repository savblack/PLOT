// Text-only conversation post (Threads + X): a genuine question to spark replies.
// Roughly half general, half hooked to a title that's trending right now. The
// worker writes the actual question from the topic hint in the payload.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate } from '../../lib/dates.mjs';

export const evaluate = async (ctx) => {
  let topic = { mode: 'general' };
  let refs = [];

  // ~50/50 split; when trending, anchor to a current title.
  if (Math.random() < 0.5) {
    const trending = (await tmdb.getTrending('all', 'week').catch(() => []))
      .filter(t => ['movie', 'tv'].includes(t.media_type) && (t.title || t.name));
    const t = trending[Math.floor(Math.random() * Math.min(trending.length, 8))];
    if (t) {
      topic = { mode: 'trending', title: t.title || t.name, media_type: t.media_type };
      refs = [{ media_type: t.media_type, id: t.id, title: t.title || t.name }];
    }
  }

  return {
    post_type: 'question',
    topic_key: `conversation:${isoDate(ctx.publishAt)}`,
    tmdb_refs: refs,
    payload: { topic },
  };
};

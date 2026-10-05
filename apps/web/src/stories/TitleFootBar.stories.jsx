import { useState } from 'react';
import { AppContext } from '../hooks/useApp.js';
import TitleFootBar from '../components/TitleFootBar.jsx';

// The bar is driven by props, so the stories wrap it in a small stand-in for
// MediaPanel's history writes: marking watched, rating and saving a review all
// land in local state, nothing reaches Supabase.
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

function Harness({ initial = {}, isTv = false, isPublicProfile = true, withNotes = true, savedNote = '' }) {
  const [entry, setEntry] = useState(initial.entry ?? null);
  const [watching, setWatching] = useState(false);
  const [rows, setRows] = useState(savedNote ? { 'movie:1': { note: savedNote, revision: 1 } } : {});

  const privateNotes = withNotes ? {
    rows,
    loading: false,
    error: '',
    reload: async () => true,
    save: async ({ text }) => {
      await wait();
      setRows(text ? { 'movie:1': { note: text, revision: 2 } } : {});
    },
  } : null;

  const watched = !!entry;
  return (
    <AppContext.Provider value={{ user: { id: 'story' }, profile: { is_public: isPublicProfile }, privateNotes }}>
      <div style={{ margin: '0 auto', width: 'min(560px, 100%)', minHeight: 420, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <TitleFootBar
          itemId={1}
          itemType={isTv ? 'tv' : 'movie'}
          title="Oppenheimer"
          watched={watched}
          dnf={false}
          rating={entry?.rating || 0}
          review={entry?.note || ''}
          watchedAt={entry?.watched_at || '2023-07-21'}
          isTv={isTv}
          isWatching={watching}
          busy={false}
          isPublicProfile={isPublicProfile}
          hasUser
          onMarkWatched={async (opts) => { await wait(); setEntry({ rating: opts?.rating || 0, note: '', watched_at: '2026-10-05' }); return { ok: true }; }}
          onStartWatching={async () => { await wait(); setWatching(true); }}
          onUndoWatched={async () => { await wait(); setEntry(null); return true; }}
          onRate={async (rating) => { await wait(); setEntry((e) => ({ ...e, rating })); return true; }}
          onSaveReview={async ({ note, watchedAt }) => { await wait(); setEntry((e) => ({ ...e, note: note || '', watched_at: watchedAt })); return true; }}
        />
      </div>
    </AppContext.Provider>
  );
}

export default {
  title: 'Panels/TitleFootBar',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};

/** Not watched: the question, ghost stars, and one primary action. A star tap logs and rates in one go. */
export const NotWatched = { args: {} };

/** A series adds I'm watching beside the primary action. */
export const NotWatchedSeries = { args: { isTv: true } };

/** Watched with nothing written: both boxes are empty, with a plus each. */
export const WatchedEmpty = { args: { initial: { entry: { rating: 0, note: '', watched_at: '2023-07-21' } } } };

/** Rated and reviewed, with a private note: both boxes written, with a pencil each. */
export const Reviewed = {
  args: {
    initial: { entry: { rating: 9, note: "Three hours and I'd have sat through another one. The sound design does half the acting.", watched_at: '2023-07-21' } },
    savedNote: 'Saw it in 70mm with Jess. Worth the trip across town.',
  },
};

/** A private profile: the review audience reads "Visible to your followers". */
export const PrivateProfile = {
  args: { isPublicProfile: false, initial: { entry: { rating: 7, note: 'Quietly devastating.', watched_at: '2023-07-21' } } },
};

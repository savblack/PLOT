import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { usePrivateNotes } from '@plot/core/usePrivateNotes.js';
import TitleFootBar from '../components/TitleFootBar';

// The bar is driven by props, so the story wraps it in a small stand-in for
// MediaPanel's history writes: marking watched, rating and saving a review land in
// local state and nothing reaches Supabase.
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
type Entry = { rating: number; note: string; watched_at: string } | null;

function Harness({ initial = null, isTv = false, isPublicProfile = true, savedNote = '' }: {
  initial?: Entry; isTv?: boolean; isPublicProfile?: boolean; savedNote?: string;
}) {
  const [entry, setEntry] = useState<Entry>(initial);
  const [watching, setWatching] = useState(false);
  const [rows, setRows] = useState<Record<string, { note: string; revision: number }>>(
    savedNote ? { 'movie:1': { note: savedNote, revision: 1 } } : {},
  );
  const privateNotes = {
    rows, loading: false, error: '', reload: async () => true,
    save: async ({ text }: { text: string }) => {
      await wait();
      setRows(text ? { 'movie:1': { note: text, revision: 2 } } : {});
    },
  } as unknown as ReturnType<typeof usePrivateNotes>;
  return (
    <SafeAreaProvider>
      <View style={{ width: 390, height: 640, justifyContent: 'flex-end', backgroundColor: '#FFFCF7', overflow: 'hidden' }}>
        <TitleFootBar
          itemId={1}
          itemType={isTv ? 'tv' : 'movie'}
          title="Oppenheimer"
          watched={!!entry}
          dnf={false}
          rating={entry?.rating ?? 0}
          review={entry?.note ?? ''}
          watchedAt={entry?.watched_at ?? '2023-07-21'}
          isTv={isTv}
          isWatching={watching}
          busy={false}
          isPublicProfile={isPublicProfile}
          hasUser
          privateNotes={privateNotes}
          onMarkWatched={async (opts) => { await wait(); setEntry({ rating: opts?.rating ?? 0, note: '', watched_at: '2026-10-05' }); return { ok: true }; }}
          onStartWatching={async () => { await wait(); setWatching(true); }}
          onUndoWatched={async () => { await wait(); setEntry(null); return true; }}
          onRate={async (rating) => { await wait(); setEntry((e) => (e ? { ...e, rating } : e)); return true; }}
          onSaveReview={async ({ note, watchedAt }) => { await wait(); setEntry((e) => (e ? { ...e, note: note ?? '', watched_at: watchedAt } : e)); return true; }}
        />
      </View>
    </SafeAreaProvider>
  );
}

export default { title: 'Panels/TitleFootBar', component: Harness };

/** Not watched: the question, ghost stars and one primary action. A star tap logs and rates in one go. */
export const NotWatched = {};
/** A series adds I'm watching beside the primary action. */
export const NotWatchedSeries = { args: { isTv: true } };
/** Watched with nothing written: both boxes empty, a plus each. */
export const WatchedEmpty = { args: { initial: { rating: 0, note: '', watched_at: '2023-07-21' } } };
/** Rated and reviewed with a private note: both boxes written, a pencil each. */
export const Reviewed = {
  args: {
    initial: { rating: 9, note: "Three hours and I'd have sat through another one. The sound design does half the acting.", watched_at: '2023-07-21' },
    savedNote: 'Saw it in 70mm with Jess. Worth the trip across town.',
  },
};
/** A private profile: the review audience reads "Visible to your followers". */
export const PrivateProfile = { args: { isPublicProfile: false, initial: { rating: 7, note: 'Quietly devastating.', watched_at: '2023-07-21' } } };

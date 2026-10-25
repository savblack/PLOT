import { useState } from 'react';
import { UpcomingSuggestionsDialog } from '../components/UpcomingSuggestionsSheet.jsx';

const shows = [
  {
    id: 200,
    media_type: 'tv',
    title: 'The Bear',
    poster_path: '/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg',
    next_air_date: '2026-11-05',
    next_code: 'S05E01',
  },
  {
    id: 201,
    media_type: 'tv',
    title: 'Slow Horses',
    poster_path: '/1ubkmdLnuFAqMVzOdHIsLGDNr4b.jpg',
    next_air_date: '2026-11-12',
    next_code: 'S05E04',
  },
];

const movies = [
  {
    id: 8,
    media_type: 'movie',
    title: 'The Odyssey',
    poster_path: '/8IbwxRFMFBEP9yqq7mOZV5qVXxG.jpg',
    release_date: '2026-11-20',
    _cinema: true,
  },
  {
    id: 9,
    media_type: 'movie',
    title: 'Project Hail Mary',
    poster_path: '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg',
    release_date: '2026-12-04',
    _cinema: false,
  },
];

export default {
  title: 'Components/UpcomingSuggestions',
  component: UpcomingSuggestionsDialog,
  parameters: { layout: 'fullscreen' },
};

function ReadySheet() {
  const [savedIds, setSavedIds] = useState(() => new Set([201]));
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const onAdd = (item) => {
    setPendingIds(prev => new Set(prev).add(item.id));
    window.setTimeout(() => {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setSavedIds(prev => new Set(prev).add(item.id));
    }, 250);
  };
  return (
    <UpcomingSuggestionsDialog
      shows={shows}
      movies={movies}
      savedIds={savedIds}
      pendingIds={pendingIds}
      onAdd={onAdd}
      onRetry={() => {}}
      onClose={() => {}}
    />
  );
}

export const Ready = {
  render: () => <ReadySheet />,
};

export const Loading = {
  render: () => (
    <UpcomingSuggestionsDialog
      loading
      onAdd={() => {}}
      onRetry={() => {}}
      onClose={() => {}}
    />
  ),
};

// Compare, before anyone is chosen: the people panel on the left and a sample
// comparison on the right, so the page shows what you get instead of a blank
// column. Choosing a person opens /u/:username/compare, which is the same
// layout with the real numbers.
import { useMemo } from 'react';
import LoginRedirect from '../components/LoginRedirect.jsx';
import ComparePeoplePanel from '../components/ComparePeoplePanel.jsx';
import { useApp } from '../hooks/useApp.js';
import { EXAMPLE_OVERLAP, exampleGenreNames } from '@plot/core/tasteOverlap.js';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';
import { TasteOverlapView } from './TasteOverlapPage.jsx';

const EXAMPLE_TARGET = { username: '', display_name: T.exampleName, avatar_url: null, is_public: true };

export default function ComparePickerPage() {
  const { user } = useApp();
  const genreName = useMemo(() => exampleGenreNames(T.exampleGenres), []);

  if (!user) return <LoginRedirect />;

  return (
    <TasteOverlapView
      example
      premium
      loading={false}
      error={null}
      target={EXAMPLE_TARGET}
      overlap={EXAMPLE_OVERLAP}
      sharedWatchlist={null}
      genreName={genreName}
      side={<ComparePeoplePanel viewerId={user.id} />}
    />
  );
}

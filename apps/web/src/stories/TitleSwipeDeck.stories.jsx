import { useState } from 'react';
import TitleSwipeDeck from '../components/TitleSwipeDeck.jsx';

const TITLES = [
  { id: 1, title: 'The Last Reel', poster_path: null, release_date: '2024-03-01' },
  { id: 2, name: 'Late Signal', poster_path: null, first_air_date: '2023-11-14' },
  { id: 3, title: 'Harbor Light', poster_path: null, release_date: '2022-06-20' },
  { id: 4, name: 'Static City', poster_path: null, first_air_date: '2021-09-02' },
  { id: 5, title: 'Untitled Fallback' }, // no poster_path, no release date — exercises the fallback label
];

export default {
  title: 'Components/TitleSwipeDeck',
  component: TitleSwipeDeck,
  parameters: { layout: 'padded' },
};

function Wrapper({ items }) {
  const [liked, setLiked] = useState([]);
  const [passed, setPassed] = useState([]);
  return (
    <div style={{ maxWidth: 340, margin: '0 auto' }}>
      <TitleSwipeDeck
        items={items}
        onResolve={(item, direction) => {
          if (direction === 'like') setLiked((prev) => [...prev, item]);
          else setPassed((prev) => [...prev, item]);
        }}
      />
      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Liked: {liked.map((i) => i.title || i.name).join(', ') || '—'}
        <br />
        Passed: {passed.map((i) => i.title || i.name).join(', ') || '—'}
      </p>
    </div>
  );
}

export const Default = () => <Wrapper items={TITLES} />;
export const SingleCard = () => <Wrapper items={[TITLES[0]]} />;
export const DeckComplete = () => <Wrapper items={[]} />;

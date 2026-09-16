import { CardGrid, HistoryCard, ListCard } from '../components/ListCards.jsx';

/* The poster card My Lists and History are built from. Poster paths are
   deliberately absent (a TMDB path must come from a real response), so the
   cards show their title placeholders. */

const noop = () => {};

const historyEntries = Array.from({ length: 12 }, (_, i) => ({
  id: `h${i}`, tmdb_id: 500 + i, title: `Watched title ${i + 1}`, media_type: i % 2 ? 'tv' : 'movie',
  poster_path: null, watched_at: `2026-09-${String(14 - i).padStart(2, '0')}`,
  rating: i % 3 === 0 ? 8 : null, note: i % 4 === 0 ? 'Loved it.' : null,
}));

export default {
  title: 'Components/ListCards',
  component: ListCard,
};

export const HistoryGrid = {
  render: () => (
    <CardGrid>
      {historyEntries.map(entry => <HistoryCard key={entry.id} entry={entry} openPanel={noop} />)}
    </CardGrid>
  ),
};

export const WatchingCard = {
  render: () => (
    <div style={{ width: 120 }}>
      <ListCard title="Severance" img={null} meta="S02 · Ep 4 of 10" progress={40} onOpen={noop} />
    </div>
  ),
};

export const Selecting = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <div style={{ width: 120 }}><ListCard title="Selected" img={null} meta="Movie" onOpen={noop} editMode selected onToggleSelect={noop} /></div>
      <div style={{ width: 120 }}><ListCard title="Not selected" img={null} meta="Series" onOpen={noop} editMode onToggleSelect={noop} /></div>
    </div>
  ),
};

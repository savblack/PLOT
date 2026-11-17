import { useState } from 'react';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import SideFilters from '../components/SideFilters.jsx';

// New Releases' side column: the Show and Genre filter, drawn as a card.
// Genres open as rows inside the card. The list is as long as the real one,
// so the story shows it scrolling within the panel.
// Genre ids here are opaque fixture values, never looked up on TMDB.
const GENRES = [
  'Action', 'Action & Adventure', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama',
  'Family', 'Fantasy', 'History', 'Horror', 'Kids', 'Music', 'Mystery', 'News', 'Reality', 'Romance',
  'Sci-Fi & Fantasy', 'Science Fiction', 'Soap', 'Talk', 'Thriller', 'TV Movie', 'War', 'War & Politics', 'Western',
].map((name, i) => ({ id: i + 1, name }));

function Preview() {
  const [typeFilters, setTypeFilters] = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  return (
    <div style={{ width: 264, padding: 24, boxSizing: 'content-box' }}>
        <SideFilters typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={genreFilters} setGenreFilters={setGenreFilters} genres={GENRES} />
    </div>
  );
}

export default { title: 'New Releases/Filter panel', component: Preview };
export const Default = {};

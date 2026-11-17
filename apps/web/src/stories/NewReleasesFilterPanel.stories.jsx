import { useState } from 'react';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import SideFilters from '../components/SideFilters.jsx';

// New Releases' side column: the Show and Genre filter, drawn as a card.
// Genre ids here are opaque fixture values, never looked up on TMDB.
const GENRES = ['Action', 'Comedy', 'Drama', 'Horror', 'Mystery'].map((name, i) => ({ id: i + 1, name }));

function Preview() {
  const [typeFilters, setTypeFilters] = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  return (
    <div style={{ width: 264, padding: 24, boxSizing: 'content-box' }}>
      <section className="hist-card new-releases-filter-card">
        <SideFilters typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={genreFilters} setGenreFilters={setGenreFilters} genres={GENRES} />
      </section>
    </div>
  );
}

export default { title: 'New Releases/Filter panel', component: Preview };
export const Default = {};

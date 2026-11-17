import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { HomePageNav } from '../components/DiscoverView.jsx';
import { defaultHomeLayout } from '@plot/core/homeLayout.js';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import SideFilters from '../components/SideFilters.jsx';

// Home's sidebar Jump to card. The sections are the default set. Customize is
// not on this card: it sits at the foot of the page (DiscoverView).
const LABELS = {
  picks: "Plot's Picks", continue: 'Continue watching', because: 'Because you watched', forYou: 'Recommended for you', hot: 'Hot Right Now', weekly: 'Top 20 This Week',
  people: 'Your people', releases: 'New Releases', binged: 'Most Binged Shows', cinema: 'Now Showing',
  streaming: 'Now on Streaming', anticipated: 'Most Anticipated', platforms: 'Top 10 By Platform',
};

function Preview() {
  const layout = defaultHomeLayout();
  const sections = layout.order.filter(id => !layout.hidden.includes(id)).map(id => ({ id: `home-${id}`, navLabel: LABELS[id] }));
  return (
    <MemoryRouter>
      <div style={{ width: 280, padding: 24 }}>
        <HomePageNav sections={sections} />
      </div>
    </MemoryRouter>
  );
}

export default { title: 'Home/Jump to card', component: Preview };
export const Default = {};

// The Jump to card with the Show / Genre filter card under it, as in Home's
// side column: the filter is a card too, and its genres open inside it.
// Genre ids here are opaque fixture values, never looked up on TMDB.
const GENRES = ['Action', 'Comedy', 'Crime', 'Drama', 'Horror', 'Mystery', 'Romance', 'Thriller'].map((name, i) => ({ id: i + 1, name }));

function SideColumn() {
  const layout = defaultHomeLayout();
  const sections = layout.order.filter(id => !layout.hidden.includes(id)).map(id => ({ id: `home-${id}`, navLabel: LABELS[id] }));
  const [typeFilters, setTypeFilters] = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  return (
    <MemoryRouter>
      <div style={{ width: 264, padding: 24, boxSizing: 'content-box', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <HomePageNav sections={sections} />
        <section className="hist-card home-filter-card">
          <SideFilters typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={genreFilters} setGenreFilters={setGenreFilters} genres={GENRES} />
        </section>
      </div>
    </MemoryRouter>
  );
}

export const WithFilterCard = { render: () => <SideColumn /> };

import { MemoryRouter } from 'react-router-dom';
import { DiscoverSectionHeader } from '../components/DiscoverView.jsx';
import { CuratedListCard } from '../components/CuratedLists.jsx';
import PicksCarousel from '../components/PicksCarousel.jsx';
import { featuredCuratedList } from '@plot/core/curatedLists.js';

// The list card in plot's Picks. Real curated data (its ids came from TMDB
// search); the trending card beside it is a stand-in, since the real one needs
// a live Discover fetch.
const curated = featuredCuratedList();

export default {
  title: 'Home/Curated list card',
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <MemoryRouter><div className="home-page" style={{ background: 'var(--bg)', padding: '1.5rem 0', maxWidth: 980 }}><div className="discover-sections home-stream"><Story /></div></div></MemoryRouter>],
};

const standIn = (badge, title) => (
  <div className="discover-hero">
    <div className="discover-hero-overlay">
      <span className="discover-hero-badge">{badge}</span>
      <h2 className="discover-hero-title">{title}</h2>
    </div>
  </div>
);

/** The Picks row as it ships: one full-width card at a time, taking turns; swipe or use the dots. Stops while hovered. */
export const Rotating = {
  render: () => (
    <section className="discover-section discover-featured-section">
      <DiscoverSectionHeader title="plot's Picks" />
      <PicksCarousel>
        {standIn('Trending #1', 'Slow Lane')}
        <CuratedListCard curated={curated} onOpen={() => {}} />
        {standIn('Trending TV', 'East Pier')}
        {standIn('Trending movie', 'Digger Bay')}
      </PicksCarousel>
    </section>
  ),
};

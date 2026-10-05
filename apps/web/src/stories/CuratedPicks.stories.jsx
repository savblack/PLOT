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

/** Beside the trending hero, the default Picks row. */
export const BesideTheHero = {
  render: () => (
    <section className="discover-section discover-featured-section">
      <DiscoverSectionHeader title="plot's Picks" />
      <div className="discover-hero-row has-two">
        <div className="discover-hero">
          <div className="discover-hero-overlay">
            <span className="discover-hero-badge">Trending #1</span>
            <h2 className="discover-hero-title">Slow Lane</h2>
            <p className="discover-hero-meta">2026 · TV Series</p>
          </div>
        </div>
        <CuratedListCard curated={curated} onOpen={() => {}} />
      </div>
    </section>
  ),
};

/** Alone, when the hero has nothing to show. */
export const Alone = {
  render: () => (
    <section className="discover-section discover-featured-section">
      <DiscoverSectionHeader title="plot's Picks" />
      <div className="discover-hero-row">
        <CuratedListCard curated={curated} onOpen={() => {}} />
      </div>
    </section>
  ),
};

const standIn = (badge, title) => (
  <div className="discover-hero">
    <div className="discover-hero-overlay">
      <span className="discover-hero-badge">{badge}</span>
      <h2 className="discover-hero-title">{title}</h2>
    </div>
  </div>
);

/** The Picks row as it ships: cards take turns, two across on desktop. Pauses on hover. */
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

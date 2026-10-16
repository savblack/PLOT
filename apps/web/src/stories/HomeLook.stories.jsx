import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../hooks/useApp.js';
import { RailSection, RankedCard } from '../components/DiscoverView.jsx';
import { ContinueCard, PeopleShelfCard } from '../components/HomeShelves.jsx';
import { feedItems } from '@plot/core/peopleFeed.js';
import { PEOPLE } from '@plot/core/copy/people.js';

// Home's Look setting (profile.ui_prefs): density and card style, drawn on
// fictional titles with no images. Ids are negative on purpose: they are not
// TMDB ids (AGENTS.md: never guess one).
const today = '2026-10-16';
const noop = () => {};
const watchlist = { items: [], isInList: () => false, loading: false, toggle: noop };
const app = { profile: { region: 'US' }, favorites: { isFavorite: () => false, toggleFavorite: noop } };
const titles = ['Slow Lane', 'Severed Ties', 'The Back Lot', 'Quips', 'East Pier', 'Digger Bay', 'The Envoy', 'Behemoth Bay', 'Late Bloom', 'Nine Doors']
  .map((title, i) => ({ id: -(i + 1), media_type: i % 2 ? 'tv' : 'movie', title, poster_path: null, release_date: '2026-09-12', first_air_date: '2026-09-12' }));
const continueItems = titles.slice(0, 4).map((t, i) => ({ tmdbId: t.id, title: t.title, posterPath: null, season: i + 1, episode: 3, latest: i === 0, progress: 0.2 + i * 0.15 }));
const row = (over) => ({ season_number: 0, kind: 'film', poster_path: null, regional_releases: {}, network: null, person_role: 'cast', ...over });
const people = feedItems([
  row({ tmdb_person_id: -10, person_name: 'Ada Quill', media_type: 'tv', tmdb_id: -20, kind: 'series', season_number: 1, title: 'East Pier', release_date: today, network: 'Service One' }),
  row({ tmdb_person_id: -11, person_name: 'Ben Arlo', person_role: 'director', media_type: 'movie', tmdb_id: -21, title: 'Digger Bay', release_date: '2026-10-08' }),
  row({ tmdb_person_id: -12, person_name: 'Cy Moss', media_type: 'tv', tmdb_id: -22, kind: 'season', season_number: 6, title: 'Slow Lane', release_date: '2026-10-01', network: 'Service Two' }),
], { region: 'US', today });

function Look({ density = 'comfy', cardStyle = 'poster' }) {
  return (
    <MemoryRouter><AppContext.Provider value={app}>
      <div className="home-page" data-density={density} data-card-style={cardStyle} style={{ background: 'var(--bg)', padding: '1.5rem 0', maxWidth: 980 }}>
        <div className="discover-sections home-stream">
          <RailSection id="home-continue" title={PEOPLE.continueWatching.title} subtitle={PEOPLE.continueWatching.subtitle}>
            {continueItems.map(item => <ContinueCard key={item.tmdbId} item={item} onOpen={noop} />)}
          </RailSection>
          <RailSection id="home-releases" title="New Releases" subtitle="Last 30 days">
            {titles.map(item => <RankedCard key={item.id} item={item} showRank={false} openPanel={noop} watchlist={watchlist} />)}
          </RailSection>
          <RailSection id="home-pin-person" title="Ada Quill">
            {people.map(item => <PeopleShelfCard key={item.key} item={item} today={today} onOpen={noop} />)}
          </RailSection>
        </div>
      </div>
    </AppContext.Provider></MemoryRouter>
  );
}

export default { title: 'Home/Look', component: Look, parameters: { layout: 'fullscreen' } };
export const ComfyPosters = {};
export const CompactPosters = { args: { density: 'compact' } };
export const ComfyList = { args: { cardStyle: 'list' } };
export const CompactList = { args: { density: 'compact', cardStyle: 'list' } };

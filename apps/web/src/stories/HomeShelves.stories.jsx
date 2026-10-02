import { MemoryRouter } from 'react-router-dom';
import { RailSection, DiscoverSectionHeader } from '../components/DiscoverView.jsx';
import { ContinueCard, PeopleInvite, PeopleShelfCard } from '../components/HomeShelves.jsx';
import { feedItems } from '@plot/core/peopleFeed.js';
import { PEOPLE } from '@plot/core/copy/people.js';

// Fictional titles and people, no images. Ids are negative on purpose: they
// are not TMDB ids (AGENTS.md: never guess one).
const today = '2026-10-01';
const continueItems = [
  { tmdbId: -1, title: 'Slow Lane', posterPath: null, season: 6, episode: 3, latest: true, progress: 0.4 },
  { tmdbId: -2, title: 'Severed Ties', posterPath: null, season: 2, episode: 7, latest: false, progress: 0.62 },
  { tmdbId: -3, title: 'The Back Lot', posterPath: null, season: 1, episode: 5, latest: false, progress: 0.45 },
  { tmdbId: -4, title: 'Quips', posterPath: null, season: 5, episode: 2, latest: false, progress: 0.12 },
];
const row = (over) => ({ season_number: 0, kind: 'film', poster_path: null, regional_releases: {}, network: null, person_role: 'cast', ...over });
const people = feedItems([
  row({ tmdb_person_id: -10, person_name: 'Ada Quill', media_type: 'tv', tmdb_id: -20, kind: 'series', season_number: 1, title: 'East Pier', release_date: today, network: 'Service One' }),
  row({ tmdb_person_id: -11, person_name: 'Ben Arlo', person_role: 'director', media_type: 'movie', tmdb_id: -21, title: 'Digger Bay', release_date: '2026-09-28', regional_releases: { AU: { kind: 'theatrical', date: '2026-09-28' } } }),
  row({ tmdb_person_id: -12, person_name: 'Cy Moss', media_type: 'tv', tmdb_id: -22, kind: 'season', season_number: 6, title: 'Slow Lane', release_date: '2026-09-16', network: 'Service Two' }),
  row({ tmdb_person_id: -13, person_name: 'Dot Hale', media_type: 'tv', tmdb_id: -23, kind: 'season', season_number: 4, title: 'The Envoy', release_date: '2026-10-15', network: 'Service One' }),
  row({ tmdb_person_id: -14, person_name: 'Eli Park', media_type: 'movie', tmdb_id: -24, title: 'Behemoth Bay', release_date: '2026-12-03' }),
], { region: 'AU', today });
const suggestions = [
  { id: -10, name: 'Ada Quill', profilePath: null, kind: 'acted', count: 3, title: 'East Pier' },
  { id: -12, name: 'Cy Moss', profilePath: null, kind: 'acted', count: 1, title: 'Slow Lane' },
  { id: -11, name: 'Ben Arlo', profilePath: null, kind: 'directed', count: 2, title: 'Digger Bay' },
  { id: -13, name: 'Dot Hale', profilePath: null, kind: 'acted', count: 1, title: 'The Envoy' },
];

export default {
  title: 'Home/Shelves',
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <MemoryRouter><div className="home-page" style={{ background: 'var(--bg)', padding: '1.5rem 0', maxWidth: 980 }}><div className="discover-sections home-stream"><Story /></div></div></MemoryRouter>],
};

/** Board R2-4a: Continue watching, under plot's Picks. Free for everyone. */
export const ContinueWatching = {
  render: () => (
    <RailSection id="home-continue" title={PEOPLE.continueWatching.title} subtitle={PEOPLE.continueWatching.subtitle}>
      {continueItems.map(item => <ContinueCard key={item.tmdbId} item={item} onOpen={() => {}} />)}
    </RailSection>
  ),
};

/** Board R2-4b: Your people, after Top 20 This Week (Premium). */
export const YourPeople = {
  render: () => (
    <RailSection id="home-people" title={PEOPLE.shelf.title} subtitle={PEOPLE.shelf.subtitle(5)}
      headerRight={<button type="button" className="discover-see-all">{PEOPLE.shelf.seeAll}</button>}>
      {people.map(item => <PeopleShelfCard key={item.key} item={item} today={today} onOpen={() => {}} />)}
    </RailSection>
  ),
};

/** Board R2-4c: a Premium member who follows nobody, with four suggestions (one a director). */
export const YourPeopleInvite = {
  render: () => (
    <section className="discover-section">
      <DiscoverSectionHeader title={PEOPLE.shelf.title} subtitle={PEOPLE.shelf.inviteSubtitle} />
      <PeopleInvite suggestions={suggestions} isFollowing={() => false} busyId={null} onToggle={() => {}} onOpenPerson={() => {}} />
    </section>
  ),
};

import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { YourPeoplePage } from '../components/YourPeopleView.jsx';
import { feedItems } from '@plot/core/peopleFeed.js';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';

// Fictional people and titles, no images. Ids are negative on purpose: they
// are not TMDB ids (AGENTS.md: never guess one).
const today = '2026-10-01';
const follows = [
  { tmdb_person_id: -1, name: 'Ada Quill', profile_path: null, known_for: 'Acting' },
  { tmdb_person_id: -2, name: 'Ben Arlo', profile_path: null, known_for: 'Directing' },
  { tmdb_person_id: -3, name: 'Cy Moss', profile_path: null, known_for: 'Acting' },
  { tmdb_person_id: -4, name: 'Dot Hale', profile_path: null, known_for: 'Acting' },
];
const row = (over) => ({ season_number: 0, kind: 'film', poster_path: null, regional_releases: {}, network: null, episode_count: null, premiere_drop: null, character: null, person_role: 'cast', ...over });
const rows = [
  row({ tmdb_person_id: -1, person_name: 'Ada Quill', media_type: 'tv', tmdb_id: -10, kind: 'series', season_number: 1, title: 'East Pier', release_date: today, network: 'Service One', episode_count: 8, premiere_drop: 8 }),
  row({ tmdb_person_id: -2, person_name: 'Ben Arlo', person_role: 'director', media_type: 'movie', tmdb_id: -11, title: 'Digger Bay', release_date: today, regional_releases: { AU: { kind: 'theatrical', date: today } } }),
  row({ tmdb_person_id: -3, person_name: 'Cy Moss', media_type: 'tv', tmdb_id: -12, kind: 'season', season_number: 6, title: 'Slow Lane', release_date: '2026-09-16', network: 'Service Two', episode_count: 6, premiere_drop: 1 }),
  row({ tmdb_person_id: -4, person_name: 'Dot Hale', media_type: 'movie', tmdb_id: -13, title: 'Practical Spells', release_date: '2026-09-10', regional_releases: { AU: { kind: 'theatrical', date: '2026-09-10' } } }),
  row({ tmdb_person_id: -4, person_name: 'Dot Hale', media_type: 'tv', tmdb_id: -14, kind: 'season', season_number: 4, title: 'The Envoy', release_date: '2026-10-15', network: 'Service One', episode_count: 8, premiere_drop: 8 }),
  row({ tmdb_person_id: -1, person_name: 'Ada Quill', media_type: 'movie', tmdb_id: -15, title: 'Dune Sea: Part Three', release_date: '2026-12-16' }),
  row({ tmdb_person_id: -2, person_name: 'Ben Arlo', person_role: 'director', media_type: 'movie', tmdb_id: -15, title: 'Dune Sea: Part Three', release_date: '2026-12-16' }),
];
const follow = { isFollowing: () => true, busyId: null, toggle: () => {}, sheet: null };

function Page({ items, follows: list }) {
  const [view, setView] = useState('date');
  const [typeFilters, setTypeFilters] = useState(ALL_TYPES);
  const [saved, setSaved] = useState(new Set([-13]));
  return (
    <YourPeoplePage follows={list} items={items} today={today} loading={false} view={view} setView={setView}
      typeFilters={typeFilters} setTypeFilters={setTypeFilters} follow={follow}
      onUnfollow={() => {}} onOpenPerson={() => {}} onOpenTitle={() => {}}
      isSaved={item => saved.has(item.tmdbId)} onSave={item => setSaved(s => new Set([...s, item.tmdbId]))} />
  );
}

export default {
  title: 'Pages/Your people',
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <MemoryRouter><div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: '2rem' }}><Story /></div></MemoryRouter>],
};

/** Board R2-5a: following on the left, everything by date on the right. */
export const ByDate = { render: () => <Page items={feedItems(rows, { region: 'AU', today })} follows={follows} /> };

/** Someone who follows nobody yet. */
export const Empty = { render: () => <Page items={[]} follows={[]} /> };

// Local browser-test entry only. No live auth, media API or user data.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { configure } from '@plot/core/config.js';
import { tmdb } from '@plot/core/tmdb.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import series from '@plot/core/tests/fixtures/imports/tmdb-episode-series.json';
import season from '@plot/core/tests/fixtures/imports/tmdb-episode-season.json';
import seasonTwo from '@plot/core/tests/fixtures/imports/tmdb-episode-season-two.json';
import { AppContext } from '../../../src/hooks/useApp.js';
import { EpisodeGuide } from '../../../src/components/MediaPanel.jsx';
import '../../../src/index.css';

const specials = {
  episodes: [
    { episode_number: 1, name: 'Before the pilot' },
    { episode_number: 2, name: 'After the finale' },
  ],
};
const client = createInMemorySupabase({
  tables: { watch_events: [], episode_watch_overrides: [] },
  unique: { episode_watch_overrides: ['user_id', 'tmdb_id', 'season_number', 'episode_number'] },
});
configure({ importEventsEnabled: false, supabaseClient: client });
tmdb.getSeason = async (_id, seasonNumber) => {
  if (Number(seasonNumber) === 0) return specials;
  return Number(seasonNumber) === 2 ? seasonTwo : season;
};
const rejectPointer = () => { throw new Error('Specials moved the series pointer'); };
const watching = { markEpisodeWatched: rejectPointer, setProgress: rejectPointer };
const numbered = {
  seasons: [
    { season_number: 0, episode_count: 2 },
    { season_number: 1, episode_count: 4 },
    { season_number: 2, episode_count: 4 },
  ],
};
const onlySpecials = { seasons: [{ season_number: 0, episode_count: 2 }] };

export function Fixture() {
  const [key, setKey] = useState(0);
  const only = new URLSearchParams(location.search).has('only');
  return <AppContext.Provider value={{ user: { id: 'owner' }, watching }}>
    <button onClick={() => setKey(value => value + 1)}>Remount guide</button>
    <EpisodeGuide
      key={key}
      tvId={series.result.id}
      currentProgress={{ current_season: 1, current_episode: 1 }}
      details={only ? onlySpecials : numbered}
    />
  </AppContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);

// Local browser-test entry only. No live auth, media API or user data.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { configure } from '@plot/core/config.js';
import { tmdb } from '@plot/core/tmdb.js';
import { emit, HISTORY_CHANGED_EVENT } from '@plot/core/events.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import series from '@plot/core/tests/fixtures/imports/tmdb-episode-series.json';
import season from '@plot/core/tests/fixtures/imports/tmdb-episode-season.json';
import seasonTwo from '@plot/core/tests/fixtures/imports/tmdb-episode-season-two.json';
import { AppContext } from '../../../src/hooks/useApp.js';
import { EpisodeGuide } from '../../../src/components/MediaPanel.jsx';
import '../../../src/index.css';

const client = createInMemorySupabase({ tables: {
  watch_events: [{ id: 'test-source', user_id: 'owner', tmdb_id: series.result.id,
    media_type: 'tv', season_number: 1, episode_number: 3 }],
}, unique: { episode_watch_overrides: ['user_id', 'tmdb_id', 'season_number', 'episode_number'] } });
configure({ importEventsEnabled: true, supabaseClient: client });
tmdb.getSeason = async (_id, seasonNumber) => seasonNumber === 2 ? seasonTwo : season;
const rejectPointer = () => { throw new Error('Sparse episode action used legacy pointer'); };
const watching = { markEpisodeWatched: rejectPointer, setProgress: rejectPointer };

export function Fixture() {
  const [owner, setOwner] = useState('owner');
  const [key, setKey] = useState(0);
  return <AppContext.Provider value={{ user: { id: owner }, watching }}>
    <button onClick={() => client.failNext('episode_watch_overrides', 'upsert', { message: 'offline' })}>Fail next save</button>
    <button onClick={() => { client.failNext('episode_watch_overrides', 'select', { message: 'offline' }); emit(HISTORY_CHANGED_EVENT); }}>Fail next read</button>
    <button onClick={() => setOwner(owner === 'owner' ? 'other' : 'owner')}>Switch account</button>
    <button onClick={() => setKey(value => value + 1)}>Remount guide</button>
    <button onClick={() => emit(HISTORY_CHANGED_EVENT)}>Reimport signal</button>
    <EpisodeGuide key={key} tvId={series.result.id} details={{ seasons: [{ season_number: 1 }, { season_number: 2 }] }} />
  </AppContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);

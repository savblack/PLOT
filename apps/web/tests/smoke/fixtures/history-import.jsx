// Real import UI, isolated event writer and captured catalogue responses.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import { tmdb } from '@plot/core/tmdb.js';
import matches from '@plot/core/tests/fixtures/imports/tmdb-trakt-matches.json';
import { AppContext } from '../../../src/hooks/useApp.js';
import ImportView from '../../../src/components/ImportView.jsx';
import '../../../src/index.css';

const events = [];
const annotations = [];
const lists = [];
let failNext = false;
let failWatchBatch = 0;
let loseNextResponse = false;
const client = createInMemorySupabase({ tables: { watch_events: [] } });
client.__db.tables.watch_events = events;
client.__db.tables.imported_annotations = annotations;
client.__owner = 'owner';
client.rpc = async (name, args) => {
  if (name === 'import_saved_annotations') {
    if (failNext) { failNext = false; return { error: { message: 'offline' } }; }
    let inserted = 0;
    for (const record of args.p_records) {
      if (annotations.some(row => row.source_key === record.source_key && row.user_id === client.__owner)) continue;
      annotations.push({ ...record, user_id: client.__owner });
      inserted++;
    }
    document.getElementById('saved-annotations').textContent = JSON.stringify(annotations);
    return { data: { inserted, duplicates: args.p_records.length - inserted } };
  }
  if (name === 'import_saved_list') {
    lists.push(args.p_list.name);
    document.getElementById('saved-lists').textContent = JSON.stringify(lists);
    return { data: { inserted: args.p_records.length, duplicates: 0 } };
  }
  if (name !== 'import_watch_events') throw new Error('Unexpected import writer');
  if (failWatchBatch > 0 && --failWatchBatch === 0) return { error: { message: 'connection interrupted' } };
  if (failNext) { failNext = false; return { error: { message: 'offline' } }; }
  let inserted = 0;
  for (const record of args.p_records) {
    if (events.some(event => event.source_key === record.event.source_key)) continue;
    events.push({ ...record.event });
    inserted++;
  }
  document.getElementById('saved-events').textContent = JSON.stringify(events);
  if (loseNextResponse) { loseNextResponse = false; throw new Error('Response lost after commit'); }
  return { data: { inserted, duplicates: args.p_records.length - inserted }, error: null };
};
configure({ importAnnotationsEnabled: true, importEventsEnabled: true, tvTimeImportEnabled: true, supabaseClient: client });
tmdb.findByImdbId = async id => matches.results[id];
tmdb.search = async title => ({ results: Object.values(matches.results).flatMap(result => [
  ...(result.movie_results || []).map(row => ({ ...row, media_type: 'movie' })),
  ...(result.tv_results || []).map(row => ({ ...row, media_type: 'tv' })),
]).filter(row => (row.title || row.name) === title) });
tmdb.getWatchProvidersForRegion = async () => ({ results: [] });

export function Fixture() {
  const [key, setKey] = useState(0);
  const [owner, setOwner] = useState('owner');
  return <MemoryRouter><AppContext.Provider value={{ user: { id: owner } }}>
    <button onClick={() => { const next = owner === 'owner' ? 'other' : 'owner'; client.__owner = next; setOwner(next); }}>Switch account</button>
    <button onClick={() => setKey(value => value + 1)}>Restart import</button>
    <button onClick={() => { failNext = true; }}>Fail next write</button>
    <button onClick={() => { failWatchBatch = 2; }}>Fail second watch batch</button>
    <button onClick={() => { loseNextResponse = true; }}>Lose next write response</button>
    <output id="saved-annotations" data-testid="saved-annotations" />
    <output id="saved-lists" data-testid="saved-lists" />
    <output id="saved-events" data-testid="saved-events" />
    <ImportView key={key} />
  </AppContext.Provider></MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

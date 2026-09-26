// Real file-import UI against an isolated database and captured TMDB responses.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import { tmdb } from '@plot/core/tmdb.js';
import historyMatches from '@plot/core/tests/fixtures/imports/tmdb-trakt-matches.json';
import matches from '@plot/core/tests/fixtures/imports/tmdb-list-matches.json';
import { AppContext } from '../../../src/hooks/useApp.js';
import ImportView from '../../../src/components/ImportView.jsx';
import '../../../src/index.css';
const client = createInMemorySupabase();
const savedLists = [];
client.rpc = async (name, args) => {
  if (name !== 'import_saved_list') throw new Error('List membership was sent to a watch writer');
  if (new URLSearchParams(location.search).has('full')) return { data: { inserted: 0, duplicates: 0, not_imported: 'free_list_limit' } };
  savedLists.push(args.p_list.name);
  document.getElementById('saved-lists').textContent = JSON.stringify(savedLists);
  return { data: { inserted: args.p_records.length, duplicates: 0 } };
};
configure({ importEventsEnabled: true, tvTimeImportEnabled: true, supabaseClient: client });
tmdb.findByImdbId = async id => historyMatches.results[id];
tmdb.search = async title => ({ results: matches.results[title] || [] });
tmdb.getWatchProvidersForRegion = async () => ({ results: [] });
createRoot(document.getElementById('root')).render(<MemoryRouter><AppContext.Provider value={{ user: { id: 'owner' } }}><output id="saved-lists" data-testid="saved-lists" /><ImportView /></AppContext.Provider></MemoryRouter>);

/* eslint-disable react-refresh/only-export-components -- a smoke fixture page, never hot-reloaded */
// The real AppShell and Home top cards (and History's empty page) for a new
// account, for the empty-library and quick-add smoke tests. No live accounts:
// an in-memory Supabase with no history and no import jobs. ?titles= sets the
// already-derived library count; ?page=history shows History.
import React, { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { configure } from '@plot/core/config.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import { AppContext } from '../../../src/hooks/useApp.js';
import AppShell from '../../../src/components/AppShell.jsx';
import HomeTopCards from '../../../src/components/HomeTopCards.jsx';
import { HistoryPage } from '../../../src/components/HistoryView.jsx';
import ActivationNudge from '../../../src/components/ActivationNudge.jsx';
import { activationNudgeSources } from '@plot/core/activationNudge.js';
import { hasFeltValue } from '@plot/core/hasFeltValue.js';
import '../../../src/styles/app.css';
import '../../../src/index.css';

const params = new URLSearchParams(window.location.search);
const titleCount = Number(params.get('titles') || 0);
const page = params.get('page') === 'history' ? 'history' : 'home';
const client = createInMemorySupabase({ tables: { history: [], import_jobs: [], notifications: [] } });
client.rpc = async (name) => (name === 'get_my_billing_status' ? { data: { isPremium: false, canManage: false, status: null }, error: null } : { data: null, error: null });
// Home's other cards use a few filters the in-memory client lacks; they only
// narrow reads of tables that are empty here, so pass them through.
const builder = Object.getPrototypeOf(client.from('history'));
for (const name of ['is', 'neq', 'gt', 'lt', 'lte', 'or', 'ilike']) if (!builder[name]) builder[name] = function passThrough() { return this; };
configure({ supabaseClient: client, simklClientId: 'smoke-simkl', tmdbProxyUrl: '/mock-tmdb' });

const user = { id: '00000000-0000-4000-8000-000000000002', email: 'new@example.com' };
const profile = { id: user.id, username: 'newbie', display_name: 'Alex', avatar_url: null, is_premium: false };
const item = { tmdb_id: 1396, media_type: 'tv', title: 'Breaking Bad' };

function Shell() {
  const [view, setView] = useState(page);
  const [searches, setSearches] = useState(0);
  const [count, setCount] = useState(titleCount);
  const [saved, setSaved] = useState(titleCount ? [item] : []);
  const app = {
    user, profile, uiPrefs: { prefs: {} },
    accountValue: { titleCount: count, sessionCount: 1, feltValue: hasFeltValue({ titleCount: count, sessionCount: 1 }) },
    watchlist: {
      items: saved, loading: false, error: null,
      isInList: id => saved.some(row => Number(row.tmdb_id) === Number(id)),
      addToList: async result => {
        setSaved(rows => [...rows, { ...result, tmdb_id: result.id }]);
        setCount(value => value + 1);
        return true;
      },
    },
    watching: { items: [], loading: false, error: false, isWatching: () => false },
    history: { entries: [], loading: false, loadError: null, isWatched: () => false },
    openSearch: () => setSearches(n => n + 1),
  };
  const sources = activationNudgeSources({ simklClientId: 'smoke-simkl' });
  return (
    <AppContext.Provider value={app}>
      <AppShell currentView={view} navigateTo={setView} profile={profile} user={user} panelOpen={false} onOpenSearch={app.openSearch}>
        <p data-testid="searches" hidden>{searches}</p>
        {page === 'home' ? (
          <div className="discover-page"><h1 style={{ margin: '0 var(--gut) 16px' }}>Good evening, Alex</h1><HomeTopCards /></div>
        ) : (
          <HistoryPage entries={[]} details={new Map()} detailsLoading={false} genreList={[]} openPanel={() => {}} activeYear={2026} onYear={() => {}}
            emptyNudge={titleCount ? null : <ActivationNudge surface="history" sources={sources} />} />
        )}
      </AppShell>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/import" element={<p data-testid="import-page">Import page</p>} />
      <Route path="*" element={<Shell />} />
    </Routes>
  </BrowserRouter>,
);

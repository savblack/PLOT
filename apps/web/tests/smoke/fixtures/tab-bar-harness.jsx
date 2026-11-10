// The real AppShell around a stand-in page, for the phone tab bar smoke test.
// Signed out and with a saved sidebar order, so nothing here reaches a server.
import React, { useState } from 'react';
import { AppContext } from '../../../src/hooks/useApp.js';
import AppShell from '../../../src/components/AppShell.jsx';
import MobilePageControls from '../../../src/components/MobilePageControls.jsx';

// A saved order that differs from the default, to show the menu follows it:
// Watch together before Just Decide before Guide.
const app = { uiPrefs: { prefs: { sidebar: ['home', 'calendar', 'my-lists', 'history', 'together', 'tonight', 'guide'] } } };

export default function Harness() {
  const [view, setView] = useState('home');
  const [searches, setSearches] = useState(0);
  // A page with filters, like Home or History: Movies and TV, both on by default.
  const [types, setTypes] = useState(['movie', 'tv']);
  return (
    <AppContext.Provider value={app}>
      <AppShell currentView={view} navigateTo={setView} profile={null} user={null} panelOpen={false} onOpenSearch={() => setSearches(n => n + 1)}>
        <p data-testid="view">{view}</p>
        <p data-testid="searches">{searches}</p>
        <p data-testid="types">{types.join(',')}</p>
        <MobilePageControls groups={[{
          heading: 'Show', value: types, defaultValue: ['movie', 'tv'], onChange: setTypes,
          options: [{ id: 'movie', label: 'Movies' }, { id: 'tv', label: 'TV' }],
        }]} />
        <div style={{ height: 1600 }} />
        <p data-testid="last-line">The last line of the page</p>
      </AppShell>
    </AppContext.Provider>
  );
}

/* eslint-disable react-refresh/only-export-components -- a smoke fixture page, never hot-reloaded */
// The real AppShell, signed in, around the real Settings page, for the Go
// Premium link smoke test. No live accounts: an in-memory Supabase answers the
// billing read with the state named by ?billing= (new, lapsed or premium).
import React, { useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { AppContext } from '../../../src/hooks/useApp.js';
import AppShell from '../../../src/components/AppShell.jsx';
import SettingsPage from '../../../src/components/SettingsPage.jsx';
import GoPremiumLink from '../../../src/components/GoPremiumLink.jsx';
import { configure } from '@plot/core/config.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import '../../../src/styles/app.css';
import '../../../src/index.css';

const params = new URLSearchParams(window.location.search);
const BILLING = {
  new: { isPremium: false, canManage: false, status: null },
  lapsed: { isPremium: false, canManage: true, status: 'canceled' },
  premium: { isPremium: true, canManage: true, status: 'active' },
};
const state = BILLING[params.get('billing')] ? params.get('billing') : 'new';
const premium = state === 'premium';
const client = createInMemorySupabase({ tables: { notifications: [] } });
client.rpc = async (name) => (name === 'get_my_billing_status' ? { data: BILLING[state], error: null } : { data: null, error: null });
configure({ supabaseClient: client });
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'sam@example.com' };
const profile = { id: user.id, username: 'sam', display_name: 'Sam Rivera', avatar_url: null, is_premium: premium };
const app = { uiPrefs: { prefs: {} } };

function Shell() {
  const [view, setView] = useState('settings');
  const location = useLocation();
  return (
    <AppShell currentView={view} navigateTo={setView} profile={profile} user={user} panelOpen={false} onOpenSearch={() => {}}>
      <p data-testid="path" hidden>{location.pathname}{location.search}</p>
      <SettingsPage
        section="account"
        onSection={() => {}}
        onSignOut={() => {}}
        account={{ name: profile.display_name, username: profile.username, avatarUrl: null, isPremium: premium }}
        accountAction={premium ? null : <GoPremiumLink profile={profile} placement="settings" className="settings-go-premium" />}
      >
        <div className="settings-group"><div className="settings-group-title">Profile</div></div>
      </SettingsPage>
    </AppShell>
  );
}

createRoot(document.getElementById('root')).render(
  <AppContext.Provider value={app}>
    <BrowserRouter>
      <Routes>
        <Route path="/pricing" element={<p data-testid="pricing">Premium page</p>} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </BrowserRouter>
  </AppContext.Provider>,
);

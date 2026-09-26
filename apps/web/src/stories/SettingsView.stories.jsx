import '../index.css';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { AppContext } from '../hooks/useApp.js';
import SettingsView from '../components/SettingsView.jsx';

// Offline fixture with no authenticated user. Navigation, search, sign-out cancel
// and coming-soon checkout can be reviewed without touching real account data.
configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});
const noop = () => {};
const profile = {
  display_name: 'Sam', username: 'samwatches', is_public: false, is_premium: false,
  region: 'AU', timezone: 'Australia/Sydney',
  streaming_providers: ['Netflix', 'Apple TV+', 'Prime Video', 'Disney+', 'Stan'].map(name => ({ name })),
  genres: [],
};

function Preview({ initialSection = 'viewing', premium = false }) {
  const [broadcastValue, setBroadcastValue] = useState({ market_id: 'Sydney', channel_ids: null });
  return (
    <MemoryRouter initialEntries={[`/settings?section=${initialSection}`]}>
      <AppContext.Provider value={{
        broadcastPreferences: { value: broadcastValue, loading: false, saving: false, error: false, retry: noop, save: async value => { setBroadcastValue(value); return true; } },
        profile: { ...profile, is_premium: premium }, user: null, theme: 'system', setTheme: noop,
        refreshProfile: noop, watchlist: { items: [] }, watching: { items: [], fetchSeason: noop },
        reminders: { reminders: [] }, customLists: { lists: [] },
      }}>
        <div style={{ height: '100dvh', overflowY: 'auto' }}><SettingsView /></div>
      </AppContext.Provider>
    </MemoryRouter>
  );
}
export default { title: 'Pages/Settings', component: Preview, parameters: { layout: 'fullscreen' } };
export const Viewing = {};
export const Billing = { args: { initialSection: 'billing' } };
export const PremiumBilling = { args: { initialSection: 'billing', premium: true } };
export const Connections = { args: { initialSection: 'connections' } };

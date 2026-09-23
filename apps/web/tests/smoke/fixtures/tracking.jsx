// Isolated real Settings component. No live accounts or provider requests.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { configure } from '@plot/core/config.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import TrackingSettings from '../../../src/components/TrackingSettings.jsx';
import '../../../src/index.css';
const tables = {
  media_integrations: [{ id: 'plex', user_id: 'owner', provider: 'plex', status: 'active' }],
  tracking_connections: [], tracking_jobs: [], tracking_review_items: [],
};
const client = createInMemorySupabase({ tables });
client.functions = { invoke: async (_name, { body }) => {
  if (!body.serverId) return { data: { servers: [{ clientIdentifier: 'server', name: 'My server' }] } };
  if (!body.accountID) return { data: { profiles: [{ accountID: '1', name: 'My profile' }, { accountID: '2', name: 'Other profile' }] } };
  client.__db.tables.media_integrations[0].selected_server = { name: 'My server', profileName: body.accountID === '1' ? 'My profile' : 'Other profile' };
  return { data: { selection: client.__db.tables.media_integrations[0].selected_server } };
} };
client.rpc = async (_name, { p_action }) => {
  if (p_action === 'sync') client.__db.tables.tracking_jobs.push({ id: 'job', user_id: 'owner', integration_id: 'plex', provider: 'plex', status: 'queued', imported: 0, duplicates: 0, skipped: 0 });
  return { data: {}, error: null };
};
configure({ trackingJobsEnabled: true, supabaseClient: client });
export function Fixture() {
  const [owner,setOwner] = useState('owner');
  return <><button onClick={() => setOwner(owner === 'owner' ? 'other' : 'owner')}>Switch account</button>
    <button onClick={() => client.failNext('tracking_jobs', 'select', { message: 'offline' })}>Fail next status read</button>
    <TrackingSettings userId={owner} connect={() => {}} disconnect={async () => { client.__db.tables.media_integrations[0].status = 'disabled'; }} />
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

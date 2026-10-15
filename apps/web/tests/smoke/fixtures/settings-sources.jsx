// Isolated real Settings › Connections › Your sources. No live accounts or
// provider requests: an in-memory Supabase with a connected Plex account that
// has no server picked yet, and an import_jobs table the enqueue RPC writes to.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { createInMemorySupabase } from '@plot/core/tests/support/inMemorySupabase.js';
import SettingsSources from '../../../src/components/SettingsSources.jsx';
import ConfirmModal from '../../../src/components/ConfirmModal.jsx';
import '../../../src/index.css';

const tables = {
  media_integrations: [{ id: 'plex', user_id: 'owner', provider: 'plex', status: 'active', display_name: null, last_sync_at: null, last_error: null, created_at: '2026-10-01T00:00:00Z', plex_account: null, plex_servers: null, selected_server: null }],
  tracking_connections: [], tracking_jobs: [], tracking_review_items: [],
  import_jobs: [],
};
const client = createInMemorySupabase({ tables });
client.functions = { invoke: async (_name, { body }) => {
  const servers = [{ clientIdentifier: 'server', name: 'My server' }];
  const profiles = [{ accountID: '1', name: 'My profile' }, { accountID: '2', name: 'Other profile' }];
  if (!body.serverId) return { data: { servers } };
  if (!body.accountID) return { data: { servers, profiles } };
  client.__db.tables.media_integrations[0].selected_server = { clientIdentifier: body.serverId, accountID: body.accountID, name: 'My server', profileName: body.accountID === '1' ? 'My profile' : 'Other profile' };
  return { data: { servers, profiles, selection: client.__db.tables.media_integrations[0].selected_server } };
} };
let jobs = 0;
client.rpc = async (name, args) => {
  if (name === 'enqueue_connection_import_job') {
    const job = { id: `job-${++jobs}`, user_id: 'owner', kind: 'connection', source: args.p_source, entry: args.p_entry, status: 'queued', phase: 'parse', progress_done: 0, progress_total: 0, imported: 0, duplicates: 0, failed: 0, review_count: 0, last_error: null, seen_at: null, created_at: new Date().toISOString(), finished_at: null };
    client.__db.tables.import_jobs.push(job);
    return { data: job, error: null };
  }
  if (name === 'cancel_import_job') {
    const job = client.__db.tables.import_jobs.find(row => row.id === args.p_job);
    if (job) { job.status = 'cancelled'; job.finished_at = new Date().toISOString(); }
    return { data: !!job, error: null };
  }
  return { data: {}, error: null };
};
configure({ trackingJobsEnabled: true, supabaseClient: client });

export function Fixture() {
  const [owner, setOwner] = useState('owner');
  const [confirm, setConfirm] = useState(null);
  return (
    <MemoryRouter initialEntries={['/settings?section=connections']}>
      <button onClick={() => setOwner(owner === 'owner' ? 'other' : 'owner')}>Switch account</button>
      <button onClick={() => client.failNext('tracking_jobs', 'select', { message: 'offline' })}>Fail next status read</button>
      <SettingsSources key={owner} userId={owner} premium={{ isPremium: false }} showConfirm={setConfirm} />
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')).render(<Fixture />);

import { useTrackingJobs } from '@plot/core/useTrackingJobs.js';
import { TRACKING } from '@plot/core/copy/tracking.js';

export default function TrackingSettings({ userId, connect, connectPlex, disconnect, connectionError, plexPolling }) {
  const tracking = useTrackingJobs(userId);
  if (!tracking.enabled) return null;
  return <div className="settings-group">
    <div className="settings-group-title">{TRACKING.title}</div>
    <div style={{ padding: '0 1rem 1rem' }}>
      <p>{TRACKING.description}</p>
      <p>{TRACKING.outgoingDescription}</p>
      {tracking.loading && <p>{TRACKING.loading}</p>}
      {connectionError && <p role="alert">{connectionError}</p>}
      {!tracking.integrations.some(row => row.provider === 'plex' && row.status === 'active') && <button className="settings-text-action" disabled={plexPolling} onClick={connectPlex}>{plexPolling ? TRACKING.authorizing : TRACKING.connectPlex}</button>}
      {tracking.error && <p role="alert">{tracking.error}</p>}
      {!tracking.integrations.some(row => row.provider === 'trakt' && row.status === 'active') &&
        <button className="settings-text-action" onClick={connect}>{TRACKING.connect}</button>}
      {tracking.integrations.filter(row => row.status !== 'disabled' || row.last_error).map(row => {
        const connection = tracking.connections.find(item => item.integration_id === row.id);
        const job = tracking.jobs.find(item => item.integration_id === row.id);
        const actions = row.status !== 'active' ? [] : [
          ...(row.provider === 'trakt' ? [['import', TRACKING.import]] : row.selected_server ? [['sync', TRACKING.sync]] : []),
          [connection?.automatic_enabled ? 'disable_automatic' : 'enable_automatic', connection?.automatic_enabled ? TRACKING.disableAutomatic : TRACKING.enableAutomatic],
          ...(job && ['failed','paused'].includes(job.status) ? [['resume', TRACKING.resume]] : []),
          ...(job && ['queued','running','retry_wait','paused'].includes(job.status) ? [['cancel', TRACKING.cancel]] : []),
        ];
        return <div key={row.id} style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 0' }}>
          <strong>{row.provider === 'trakt' ? 'Trakt' : 'Plex'}</strong>
          {row.provider === 'plex' && <>
            {row.selected_server && <p>{TRACKING.selectedSource(row.selected_server)}</p>}
            <button className="settings-text-action" disabled={tracking.busy} onClick={() => tracking.plexSource()}>{TRACKING.chooseSource}</button>
            {tracking.sources.servers.map(server => <button className="settings-text-action" key={server.clientIdentifier} disabled={tracking.busy} onClick={() => tracking.plexSource(server.clientIdentifier)}>{server.name}</button>)}
            {tracking.sources.profiles.map(profile => <button className="settings-text-action" key={profile.accountID} disabled={tracking.busy} onClick={() => tracking.plexSource(tracking.sources.serverId, profile.accountID)}>{profile.name}</button>)}
          </>}
          <p>{connection?.last_success_at ? TRACKING.success(new Date(connection.last_success_at).toLocaleString()) : TRACKING.never}</p>
          {job && <p>{TRACKING.statuses[job.status]}: {TRACKING.counts(job)}</p>}
          {(job?.last_error || row.last_error) && <p role="alert">{job?.last_error || row.last_error}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {actions.map(([action,label]) => <button className="settings-text-action" key={action} disabled={tracking.busy} onClick={() => tracking.control(row.id, action)}>{label}</button>)}
            <button className="settings-text-action" disabled={tracking.busy} onClick={async () => { await disconnect(row.provider); await tracking.load(); }}>{TRACKING.disconnect}</button>
          </div>
        </div>;
      })}
      {tracking.reviews.map(review => <div key={review.id}>
        <p>{TRACKING.review}: {review.payload?.summary?.title}</p>
        <p>{TRACKING.reviewDetails(review.payload.event)}</p>
        <button className="settings-text-action" disabled={tracking.busy} onClick={() => tracking.resolve(review.id,true)}>{TRACKING.keep}</button>
        <button className="settings-text-action" disabled={tracking.busy} onClick={() => tracking.resolve(review.id,false)}>{TRACKING.skip}</button>
      </div>)}
      <button className="settings-text-action" onClick={tracking.load}>{TRACKING.refresh}</button>
    </div>
  </div>;
}

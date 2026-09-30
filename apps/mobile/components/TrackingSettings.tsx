import { View, Text, TouchableOpacity } from 'react-native';
import { useTrackingJobs } from '@plot/core/useTrackingJobs.js';
import { TRACKING } from '@plot/core/copy/tracking.js';
import { useTheme } from '../contexts/ThemeContext';

export default function TrackingSettings({ userId, connect, connectPlex, disconnect, connectionError, plexPolling }: {
  userId: string | null; connect: () => void; connectPlex: () => void; connectionError?: string | null; plexPolling?: boolean; disconnect: (provider: string) => Promise<void>;
}) {
  const tracking = useTrackingJobs(userId);
  const { colors } = useTheme();
  if (!tracking.enabled) return null;
  const button = (label: string, action: () => void) => <TouchableOpacity key={label} accessibilityRole="button" disabled={tracking.busy} onPress={action} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}><Text style={{ color: colors.textPrimary }}>{label}</Text></TouchableOpacity>;
  return <View style={{ margin: 16, gap: 8 }}>
    <Text style={{ color: colors.textPrimary }}>{TRACKING.title}</Text>
    <Text style={{ color: colors.textMuted }}>{TRACKING.description}</Text>
    <Text style={{ color: colors.textMuted }}>{TRACKING.outgoingDescription}</Text>
    {tracking.loading && <Text style={{ color: colors.textMuted }}>{TRACKING.loading}</Text>}
    {connectionError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{connectionError}</Text>}
    {!tracking.integrations.some(row => row.provider === 'plex' && row.status === 'active') && (plexPolling ? <Text style={{ color: colors.textMuted }}>{TRACKING.authorizing}</Text> : button(TRACKING.connectPlex, connectPlex))}
    {tracking.error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{tracking.error}</Text>}
    {!tracking.integrations.some(row => row.provider === 'trakt' && row.status === 'active') && button(TRACKING.connect, connect)}
    {tracking.integrations.filter(row => row.status !== 'disabled' || row.last_error).map(row => {
      const connection = tracking.connections.find(item => item.integration_id === row.id);
      const job = tracking.jobs.find(item => item.integration_id === row.id);
      return <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
        <Text style={{ color: colors.textPrimary }}>{row.provider === 'trakt' ? 'Trakt' : 'Plex'}</Text>
        <Text style={{ color: colors.textMuted }}>{connection?.last_success_at ? TRACKING.success(new Date(connection.last_success_at).toLocaleString()) : TRACKING.never}</Text>
        {job && <Text style={{ color: colors.textMuted }}>{TRACKING.statuses[job.status as keyof typeof TRACKING.statuses]}: {TRACKING.counts(job)}</Text>}
        {(job?.last_error || row.last_error) && <Text style={{ color: colors.danger }}>{job?.last_error || row.last_error}</Text>}
        {row.status === 'active' && <>
        {row.provider === 'plex' && <>
          {row.selected_server && <Text style={{ color: colors.textMuted }}>{TRACKING.selectedSource(row.selected_server)}</Text>}
          {button(TRACKING.chooseSource, () => { void tracking.plexSource(); })}
          {tracking.sources.servers.map(server => button(server.name, () => { void tracking.plexSource(server.clientIdentifier); }))}
          {tracking.sources.profiles.map(profile => button(profile.name, () => { void tracking.plexSource(tracking.sources.serverId, profile.accountID); }))}
          {row.selected_server && button(TRACKING.sync, () => { void tracking.control(row.id, 'sync'); })}
        </>}
        {row.provider === 'trakt' && button(TRACKING.import, () => { void tracking.control(row.id,'import'); })}
        {button(connection?.automatic_enabled ? TRACKING.disableAutomatic : TRACKING.enableAutomatic, () => { void tracking.control(row.id, connection?.automatic_enabled ? 'disable_automatic' : 'enable_automatic'); })}
        {job && ['failed','paused'].includes(job.status) && button(TRACKING.resume, () => { void tracking.control(row.id,'resume'); })}
        {job && ['queued','running','retry_wait','paused'].includes(job.status) && button(TRACKING.cancel, () => { void tracking.control(row.id,'cancel'); })}
        </>}
        {button(TRACKING.disconnect, () => { void disconnect(row.provider).then(tracking.load); })}
      </View>;
    })}
    {tracking.reviews.map(review => <View key={review.id}>
      <Text style={{ color: colors.textPrimary }}>{TRACKING.review}: {review.payload?.summary?.title}</Text>
      <Text style={{ color: colors.textMuted }}>{TRACKING.reviewDetails(review.payload.event)}</Text>
      {button(TRACKING.keep, () => { void tracking.resolve(review.id,true); })}
      {button(TRACKING.skip, () => { void tracking.resolve(review.id,false); })}
    </View>)}
    {button(TRACKING.refresh, tracking.load)}
  </View>;
}

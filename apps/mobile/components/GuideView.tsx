// Native renderer. The account settings, dates, filtering and loading lifecycle
// are shared with web. FlatList virtualizes large broadcast schedules.
import { useState } from 'react';
import { View, Text, Pressable, FlatList, ScrollView, Modal, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../lib/tabBar';
import { GUIDE_REGIONS, guideDay, broadcastTime, broadcastDayLabel, isOnNow } from '@plot/core/broadcastGuide.js';
import { useBroadcastAgenda } from '@plot/core/useBroadcastAgenda.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { COMMON } from '@plot/core/copy/common.js';
import BroadcastGuideSetup from './BroadcastGuideSetup';
import ModalHeader from './ModalHeader';
import Button from './Button';
import Chip from './Chip';
import SearchField from './SearchField';
import PageSheet from './PageSheet';

type Programme = { id: string; channelId: string; title: string; start: string; end: string; description?: string };
type Channel = { id: string; name: string };

export default function GuideView({ showHeading = true }: { showHeading?: boolean }) {
  const { broadcastPreferences: preferences, profile } = useAppData();
  const { colors } = useTheme();
  if (preferences.loading) return <Text style={{ color: colors.textPrimary }}>{COPY.loading}</Text>;
  if (preferences.error) return <View><Text style={{ color: colors.textPrimary }}>{COPY.preferencesError}</Text><Pressable accessibilityRole="button" onPress={preferences.retry}><Text style={{ color: colors.accentText }}>{COPY.retry}</Text></Pressable></View>;
  const market = GUIDE_REGIONS.find(m => m.id === preferences.value.market_id);
  if (!market || !market.provider || market.scope === 'unavailable') return <BroadcastGuideSetup key={preferences.value.market_id || 'new'} preferences={preferences} profileRegion={profile?.region} />;
  return <BroadcastAgenda key={market.id} region={market.id} preferences={preferences} showHeading={showHeading} />;
}

export function BroadcastAgenda({ region, preferences, endpoint = '', showHeading = true }: { region: string; preferences: ReturnType<typeof useAppData>['broadcastPreferences']; endpoint?: string; showHeading?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const agenda = useBroadcastAgenda(region, preferences.value.channel_ids, endpoint);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [selected, setSelected] = useState<Programme | null>(null);
  const { market, timezone, now, date, today, data, error, loading, channels, visibleChannels, programmes } = agenda;
  const time = (stamp: string) => broadcastTime(stamp, date, timezone);
  const names = new Map<string, string>((channels as Channel[]).map(c => [c.id, c.name]));
  // Actions are the shared small button; the day and All day / Now pickers are chips.
  const button = (label: string, onPress: () => void, disabled = false) => <Button size="sm" label={label} onPress={onPress} disabled={disabled} />;
  async function apply() {
    const ok = await preferences.save({ market_id: region, channel_ids: draft });
    setSaveError(!ok);
    if (ok) setDraft(null);
  }
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <FlatList<Programme>
      data={programmes}
      keyExtractor={p => p.id}
      contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}
      ListHeaderComponent={<View style={{ gap: 12 }}>
        {showHeading && <Text style={{ fontFamily: fontFamily.display, fontSize: 28, color: colors.textPrimary }}>{COPY.title}</Text>}
        <Text style={{ color: colors.textMuted }}>{market.name} · {timezone}</Text>
        {button(COPY.changeRegion, () => router.push('/settings'))}
        <Text style={{ color: colors.textMuted }}>{COPY.coverage[market.scope as keyof typeof COPY.coverage]}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {Array.from({ length: market.days }, (_, index) => <Chip key={index} label={index === 0 ? COPY.today : `${broadcastDayLabel(guideDay(today, index), { weekday: 'short' })} ${broadcastDayLabel(guideDay(today, index), { day: 'numeric' })}`} onPress={() => { agenda.setOffset(index); agenda.setMode('all'); }} selected={index === agenda.offset} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}><Chip label={COPY.allDay} onPress={() => agenda.setMode('all')} selected={agenda.mode === 'all'} /><Chip label={COPY.now} onPress={() => { agenda.setMode('now'); agenda.setOffset(0); }} selected={agenda.mode === 'now'} /></View>
        {button(COPY.channels, () => { setDraft(visibleChannels.map((c: Channel) => c.id)); setSaveError(false); }, !data)}
        <SearchField accessibilityLabel={COPY.search} placeholder={COPY.search} value={agenda.query} onChangeText={agenda.setQuery} />
        <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.display }}>{broadcastDayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        {data && (agenda.stale || error) && <View><Text style={{ color: colors.textMuted }}>{error ? COPY.cached : COPY.stale}</Text>{button(COPY.retry, agenda.retry)}</View>}
        {data && agenda.missingChannelCount > 0 && <Text style={{ color: colors.textMuted }}>{COPY.missingChannels(agenda.missingChannelCount)}</Text>}
      </View>}
      ListEmptyComponent={<View style={{ paddingVertical: 24 }}><Text style={{ color: colors.textMuted }}>{loading ? COPY.loading : !data ? COPY.unavailable : !visibleChannels.length ? COPY.noneSelected : COPY.empty}</Text>{!loading && !data && button(COPY.retry, agenda.retry)}</View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => setSelected(item)} style={{ paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.border, gap: 6 }}><Text style={{ color: colors.textPrimary, fontFamily: fontFamily.sansBold }}>{item.title}</Text><Text style={{ color: colors.textMuted }}>{names.get(item.channelId)} · {time(item.start)}–{time(item.end)}</Text>{isOnNow(item, now) && <Text style={{ color: colors.accentText }}>{COPY.now}</Text>}</Pressable>}
      ListFooterComponent={data ? <View style={{ paddingTop: 16, gap: 8 }}>{button(`${COPY.providerLabel}: ${data.source}`, () => { void Linking.openURL(data.sourceUrl); })}<Text style={{ color: colors.textMuted }}>{COPY.updated} {new Date(data.fetchedAt).toLocaleString('en-AU', { timeZone: timezone })}</Text></View> : null}
    />
    {draft !== null && (
      <PageSheet
        title={COPY.channels}
        onClose={() => { if (!preferences.saving) setDraft(null); }}
        closeLabel={COPY.cancel}
        onSave={() => { void apply(); }}
        saveLabel={COPY.apply}
        saving={preferences.saving}
        error={saveError ? COPY.saveError : null}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {button(COPY.allChannels, () => setDraft(channels.map((c: Channel) => c.id)), preferences.saving)}
            {button(COPY.noChannels, () => setDraft([]), preferences.saving)}
          </View>
          {(channels as Channel[]).map(c => <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: draft?.includes(c.id), disabled: preferences.saving }} disabled={preferences.saving} onPress={() => setDraft(current => current?.includes(c.id) ? current.filter(id => id !== c.id) : [...(current || []), c.id])} style={{ paddingVertical: 12 }}><Text style={{ color: colors.textPrimary }}>{draft?.includes(c.id) ? '✓ ' : ''}{c.name}</Text></Pressable>)}
        </ScrollView>
      </PageSheet>
    )}
    <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <ModalHeader title={selected?.title ?? ''} actionLabel={COMMON.cancel} onAction={() => setSelected(null)} />
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
          {selected && <><Text style={{ color: colors.textMuted }}>{names.get(selected.channelId)} · {time(selected.start)}–{time(selected.end)}</Text><Text style={{ color: colors.textPrimary }}>{selected.description || COPY.noDescription}</Text></>}
        </ScrollView>
      </View>
    </Modal>
  </View>;
}

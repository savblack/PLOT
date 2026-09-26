// Native renderer. The account settings, dates, filtering and loading lifecycle
// are shared with web. FlatList virtualizes large broadcast schedules.
import { useState } from 'react';
import { View, Text, Pressable, FlatList, ScrollView, TextInput, Modal, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../lib/tabBar';
import { GUIDE_REGIONS, guideDay, broadcastTime, broadcastDayLabel, isOnNow } from '@plot/core/broadcastGuide.js';
import { useBroadcastAgenda } from '@plot/core/useBroadcastAgenda.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import BroadcastGuideSetup from './BroadcastGuideSetup';

type Programme = { id: string; channelId: string; title: string; start: string; end: string; description?: string };
type Channel = { id: string; name: string };

export default function GuideView() {
  const { broadcastPreferences: preferences, profile } = useAppData();
  const { colors } = useTheme();
  if (preferences.loading) return <Text style={{ color: colors.textPrimary }}>{COPY.loading}</Text>;
  if (preferences.error) return <View><Text style={{ color: colors.textPrimary }}>{COPY.preferencesError}</Text><Pressable accessibilityRole="button" onPress={preferences.retry}><Text style={{ color: colors.accentText }}>{COPY.retry}</Text></Pressable></View>;
  const market = GUIDE_REGIONS.find(m => m.id === preferences.value.market_id);
  if (!market || !market.provider || market.scope === 'unavailable') return <BroadcastGuideSetup key={preferences.value.market_id || 'new'} preferences={preferences} profileRegion={profile?.region} />;
  return <BroadcastAgenda key={market.id} region={market.id} preferences={preferences} />;
}

export function BroadcastAgenda({ region, preferences, endpoint = '' }: { region: string; preferences: ReturnType<typeof useAppData>['broadcastPreferences']; endpoint?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const agenda = useBroadcastAgenda(region, preferences.value.channel_ids, endpoint);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [selected, setSelected] = useState<Programme | null>(null);
  const { market, timezone, now, date, today, data, error, loading, channels, visibleChannels, programmes } = agenda;
  const time = (stamp: string) => broadcastTime(stamp, date, timezone);
  const names = new Map<string, string>((channels as Channel[]).map(c => [c.id, c.name]));
  const button = (label: string, onPress: () => void, active = false, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={{ alignSelf: 'flex-start', padding: 12, borderWidth: 1, borderColor: active ? colors.accent : colors.border, borderRadius: 8, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: active ? colors.accentText : colors.textPrimary }}>{label}</Text></Pressable>;
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
        <Text style={{ fontFamily: fontFamily.display, fontSize: 28, color: colors.textPrimary }}>{COPY.title}</Text>
        <Text style={{ color: colors.textMuted }}>{market.name} · {timezone}</Text>
        {button(COPY.changeRegion, () => router.push('/settings'))}
        <Text style={{ color: colors.textMuted }}>{COPY.coverage[market.scope as keyof typeof COPY.coverage]}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {Array.from({ length: market.days }, (_, index) => <View key={index}>{button(index === 0 ? COPY.today : broadcastDayLabel(guideDay(today, index), { weekday: 'short', day: 'numeric' }), () => { agenda.setOffset(index); agenda.setMode('all'); }, index === agenda.offset)}</View>)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>{button(COPY.allDay, () => agenda.setMode('all'), agenda.mode === 'all')}{button(COPY.now, () => { agenda.setMode('now'); agenda.setOffset(0); }, agenda.mode === 'now')}</View>
        {button(COPY.channels, () => { setDraft(visibleChannels.map((c: Channel) => c.id)); setSaveError(false); }, false, !data)}
        <TextInput accessibilityLabel={COPY.search} placeholder={COPY.search} placeholderTextColor={colors.textMuted} value={agenda.query} onChangeText={agenda.setQuery} style={{ color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 8 }} />
        <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.display }}>{broadcastDayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        {data && (agenda.stale || error) && <View><Text style={{ color: colors.textMuted }}>{error ? COPY.cached : COPY.stale}</Text>{button(COPY.retry, agenda.retry)}</View>}
        {data && agenda.missingChannelCount > 0 && <Text style={{ color: colors.textMuted }}>{COPY.missingChannels(agenda.missingChannelCount)}</Text>}
      </View>}
      ListEmptyComponent={<View style={{ paddingVertical: 24 }}><Text style={{ color: colors.textMuted }}>{loading ? COPY.loading : !data ? COPY.unavailable : !visibleChannels.length ? COPY.noneSelected : COPY.empty}</Text>{!loading && !data && button(COPY.retry, agenda.retry)}</View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => setSelected(item)} style={{ paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.border, gap: 6 }}><Text style={{ color: colors.textPrimary, fontFamily: fontFamily.sansBold }}>{item.title}</Text><Text style={{ color: colors.textMuted }}>{names.get(item.channelId)} · {time(item.start)}–{time(item.end)}</Text>{isOnNow(item, now) && <Text style={{ color: colors.accentText }}>{COPY.now}</Text>}</Pressable>}
      ListFooterComponent={data ? <View style={{ paddingTop: 16, gap: 8 }}>{button(`${COPY.providerLabel}: ${data.source}`, () => { void Linking.openURL(data.sourceUrl); })}<Text style={{ color: colors.textMuted }}>{COPY.updated} {new Date(data.fetchedAt).toLocaleString('en-AU', { timeZone: timezone })}</Text></View> : null}
    />
    <Modal visible={draft !== null} animationType="slide" onRequestClose={() => { if (!preferences.saving) setDraft(null); }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, gap: 12 }} style={{ backgroundColor: colors.bg }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.display, fontSize: 24 }}>{COPY.channels}</Text>
        {button(COPY.allChannels, () => setDraft(channels.map((c: Channel) => c.id)), false, preferences.saving)}
        {button(COPY.noChannels, () => setDraft([]), false, preferences.saving)}
        {(channels as Channel[]).map(c => <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: draft?.includes(c.id), disabled: preferences.saving }} disabled={preferences.saving} onPress={() => setDraft(current => current?.includes(c.id) ? current.filter(id => id !== c.id) : [...(current || []), c.id])} style={{ padding: 12 }}><Text style={{ color: colors.textPrimary }}>{draft?.includes(c.id) ? '✓ ' : ''}{c.name}</Text></Pressable>)}
        {button(preferences.saving ? COPY.saving : COPY.apply, apply, true, preferences.saving)}
        {button(COPY.cancel, () => setDraft(null), false, preferences.saving)}
        {saveError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{COPY.saveError}</Text>}
      </ScrollView>
    </Modal>
    <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, gap: 16 }}>
        {button(COPY.close, () => setSelected(null))}
        {selected && <><Text style={{ color: colors.textPrimary, fontFamily: fontFamily.display, fontSize: 28 }}>{selected.title}</Text><Text style={{ color: colors.textMuted }}>{names.get(selected.channelId)} · {time(selected.start)}–{time(selected.end)}</Text><Text style={{ color: colors.textPrimary }}>{selected.description || COPY.noDescription}</Text></>}
      </ScrollView>
    </Modal>
  </View>;
}

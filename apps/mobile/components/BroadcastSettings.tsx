// Native controls match the existing settings screen; @expo/ui is not an app dependency.
// Persistence and market validation live in core and are shared with web.
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { GUIDE_REGIONS, GUIDE_COUNTRIES, guideMarketsForCountry } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { fontFamily } from '../lib/tokens';

export default function BroadcastSettings() {
  const { broadcastPreferences: preferences } = useAppData();
  const { colors } = useTheme();
  if (preferences.loading) return <Text style={{ color: colors.textMuted }}>{COPY.loading}</Text>;
  if (preferences.error) return <View><Text style={{ color: colors.textPrimary }}>{COPY.preferencesError}</Text><Pressable accessibilityRole="button" onPress={preferences.retry}><Text style={{ color: colors.accentText }}>{COPY.retry}</Text></Pressable></View>;
  return <BroadcastSettingsForm preferences={preferences} />;
}

export function BroadcastSettingsForm({ preferences }: { preferences: ReturnType<typeof useAppData>['broadcastPreferences'] }) {
  const { colors } = useTheme();
  const [region, setRegion] = useState(preferences.value.market_id || '');
  const market = GUIDE_REGIONS.find(m => m.id === region);
  const [country, setCountry] = useState(market?.country || '');
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save() {
    const ok = await preferences.save({ market_id: region, channel_ids: region === preferences.value.market_id ? preferences.value.channel_ids : null });
    setError(!ok); setSaved(ok);
  }
  const choice = (id: string, label: string, selected: boolean, onPress: () => void) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected, disabled: preferences.saving }} disabled={preferences.saving} onPress={onPress} style={{ padding: 12, borderBottomWidth: 1, borderColor: colors.border }}><Text style={{ color: selected ? colors.accentText : colors.textPrimary }}>{selected ? '✓ ' : ''}{label}</Text></Pressable>;
  return <View style={{ padding: 16, gap: 12 }}>
    <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.display, fontSize: 20 }}>{COPY.region}</Text>
    <Text style={{ color: colors.textMuted }}>{COPY.accountNote}</Text>
    <Text style={{ color: colors.textPrimary }}>{COPY.country}</Text>
    {GUIDE_COUNTRIES.map(code => choice(code, COPY.countries[code as keyof typeof COPY.countries], code === country, () => { setCountry(code); setRegion(''); setSaved(false); }))}
    {!!country && <Text style={{ color: colors.textPrimary }}>{COPY.market}</Text>}
    {guideMarketsForCountry(country).map(m => choice(m.id, m.name, m.id === region, () => { setRegion(m.id); setSaved(false); }))}
    {market && <Text style={{ color: colors.textMuted }}>{COPY.coverage[market.scope as keyof typeof COPY.coverage]}</Text>}
    <Pressable accessibilityRole="button" disabled={!region || preferences.saving} onPress={save} style={{ alignSelf: 'flex-start', padding: 12, opacity: !region || preferences.saving ? 0.5 : 1 }}><Text style={{ color: colors.accentText }}>{preferences.saving ? COPY.saving : COPY.saveRegion}</Text></Pressable>
    {saved && <Text accessibilityLiveRegion="polite" style={{ color: colors.textPrimary }}>{COPY.regionSaved}</Text>}
    {error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{COPY.saveError}</Text>}
  </View>;
}

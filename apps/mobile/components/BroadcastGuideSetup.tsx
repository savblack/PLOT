// Native renderer of the shared setup form. Expandable choices follow the
// existing BroadcastSettings controls without adding a native dependency.
import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUIDE_COUNTRIES } from '@plot/core/broadcastGuide.js';
import { useBroadcastSetup } from '@plot/core/useBroadcastSetup.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../lib/tabBar';

export default function BroadcastGuideSetup({ preferences, profileRegion }: {
  preferences: ReturnType<typeof useAppData>['broadcastPreferences'];
  profileRegion?: string;
}) {
  const setup = useBroadcastSetup(preferences, profileRegion);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<'country' | 'region' | null>(null);
  const countryName = COPY.countries[setup.country as keyof typeof COPY.countries];
  const options = open === 'country'
    ? GUIDE_COUNTRIES.map(id => ({ id, name: COPY.countries[id as keyof typeof COPY.countries] }))
    : setup.markets;
  const notice = setup.market && !setup.available ? COPY.coverage[setup.market.scope as keyof typeof COPY.coverage] : null;
  const row = (field: 'country' | 'region', label: string, value: string, disabled = false) => <Pressable
    accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}
    accessibilityState={{ expanded: open === field, disabled: disabled || preferences.saving }}
    disabled={disabled || preferences.saving} onPress={() => setOpen(open === field ? null : field)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, borderBottomWidth: 1, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }}
  >
    <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.sans, fontSize: 14 }}>{label}</Text>
    <Text style={{ flex: 1, textAlign: 'right', color: colors.textPrimary, fontFamily: fontFamily.sans, fontSize: 14 }}>{value}</Text>
    <Svg width={16} height={16} viewBox="0 0 24 24" stroke={colors.textPrimary} strokeWidth={1.5} fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d={open === field ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></Svg>
  </Pressable>;
  const choices = (field: 'country' | 'region') => open === field && <View accessibilityRole="radiogroup">
    {options.map(option => {
      const selected = option.id === (field === 'country' ? setup.country : setup.region);
      return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: preferences.saving }} disabled={preferences.saving}
        onPress={() => { if (field === 'country') setup.chooseCountry(option.id); else setup.chooseRegion(option.id); setOpen(null); }}
        style={{ padding: 14, minHeight: 48, borderBottomWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: selected ? colors.accentText : colors.textPrimary, fontFamily: fontFamily.sans, fontSize: 14 }}>{selected ? '✓ ' : ''}{option.name}</Text>
      </Pressable>;
    })}
  </View>;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}>
    <View style={{ padding: 24, borderRadius: 20, backgroundColor: colors.surfaceSunken, gap: 20 }}>
      <View style={{ gap: 14 }}>
        <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fontFamily.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8 }}>{COPY.setup.title}{'\n'}{COPY.setup.titleEnd}</Text>
        <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 23 }}>{COPY.setup.description}</Text>
      </View>
      <View>
        {row('country', COPY.country, countryName || COPY.setup.countryPlaceholder)}
        {choices('country')}
        {row('region', COPY.setup.area, setup.market?.name || COPY.setup.areaPlaceholder, !setup.country)}
        {choices('region')}
      </View>
      {notice && <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary, fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 20 }}>{notice}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <Text style={{ color: colors.textMuted, fontFamily: fontFamily.sans, fontSize: 12 }}>{COPY.setup.hint}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !setup.canSave, busy: preferences.saving }} disabled={!setup.canSave} onPress={() => { void setup.save(); }}
          style={{ marginLeft: 'auto', minHeight: 44, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: colors.accentFill, opacity: setup.canSave ? 1 : 0.5, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: colors.onAccentFill, fontFamily: fontFamily.sansMedium, fontSize: 13 }}>{preferences.saving ? COPY.saving : COPY.setup.submit}</Text>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.onAccentFill} strokeWidth={1.5} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d="M4 12h16m-6-6 6 6-6 6" /></Svg>
        </Pressable>
      </View>
      {setup.error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 20 }}>{COPY.saveError}</Text>}
    </View>
  </ScrollView>;
}

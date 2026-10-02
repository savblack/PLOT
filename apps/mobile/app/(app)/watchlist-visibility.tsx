/**
 * Who can see your Want to Watch — /(app)/watchlist-visibility (mirrors web
 * WatchlistVisibilitySetting in Settings › Privacy). The rule is enforced by
 * can_view_watchlist in the database; the choices and people come from
 * @plot/core/watchlistVisibility.js, shared with web.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { PROFILE_PRIVACY } from '@plot/core/copy/profilePrivacy.js';
import { useWatchlistVisibility, useWatchlistViewers, watchlistVisibilityOptions } from '@plot/core/watchlistVisibility.js';
import { Avatar } from '../../components/Avatar';
import { Palette, fontFamily, fontSize, spacing } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

const T = PROFILE_PRIVACY.watchlist;

export default function WatchlistVisibilityScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, profile } = useAppData();
  const isPublic = !!profile?.is_public;
  const { visibility, loaded, setVisibility } = useWatchlistVisibility(userId, isPublic);
  const { people, setSelected } = useWatchlistViewers(visibility === 'selected' ? userId : null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{T.heading}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        <View style={styles.group} accessibilityRole="radiogroup">
          {watchlistVisibilityOptions(isPublic).map(value => {
            const checked = visibility === value;
            return (
              <TouchableOpacity key={value} style={styles.option} disabled={!loaded} onPress={() => setVisibility(value)}
                accessibilityRole="radio" accessibilityState={{ checked, disabled: !loaded }} activeOpacity={0.7}>
                <View style={[styles.radio, checked && styles.radioOn]}>{checked && <View style={styles.radioDot} />}</View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{T.option[value]}</Text>
                  <Text style={styles.hint}>{T.hint[value]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {visibility === 'selected' && (
          <View style={styles.group}>
            <Text style={styles.heading}>{T.pickHeading}</Text>
            {people.length === 0 && <Text style={styles.hint}>{T.pickEmpty}</Text>}
            {people.map(p => {
              const name = p.display_name || p.username || '';
              const relation = p.is_follower && p.is_partner ? T.followerAndPartner : p.is_partner ? T.partner : T.follower;
              return (
                <View key={p.id} style={styles.person}>
                  <Avatar url={p.avatar_url} name={name} size={36} colors={colors} />
                  <View style={styles.optionText}>
                    <Text style={styles.personName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.hint}>{relation}</Text>
                  </View>
                  <Switch value={p.selected} onValueChange={on => { setSelected(p.id, on); }} trackColor={{ true: colors.accent }}
                    accessibilityLabel={`${T.pickHeading}: ${name}`} />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  backBtn: { padding: 4 },
  topBarTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  group: { marginTop: spacing.lg },
  heading: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary, marginBottom: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 44, paddingVertical: spacing.sm },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  personName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
});

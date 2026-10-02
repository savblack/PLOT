// Who to compare with. Phone layout of ComparePickerPage: people you follow,
// then search. Back returns to History when this screen was opened on its own.
import { useMemo, useState } from 'react';
import { View, Text, TextInput, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlotLoader from '@plot/ui/PlotLoader';
import { useCompareCandidates } from '@plot/core/useTasteOverlap.js';
import { canCompare } from '@plot/core/tasteOverlap.js';
import { TASTE_OVERLAP as T } from '@plot/core/copy/tasteOverlap.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { fontFamily, fontSize, spacing, radii, type Palette } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

type Candidate = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_public?: boolean | null;
  follow_status?: string | null;
};

function asCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (!row || typeof row !== 'object') return [];
    const person = row as Candidate;
    if (typeof person.id !== 'string' || typeof person.username !== 'string') return [];
    return [person];
  });
}

function detailFor(person: Candidate) {
  if (person.is_public) return T.publicProfile;
  if (person.follow_status === 'accepted') return T.privateApproved;
  return T.privateProfile;
}

export default function ComparePickerScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAppData();
  const [query, setQuery] = useState('');
  const { following, results, loadingFollowing, searching, isSearching } = useCompareCandidates(userId, query);
  const list = asCandidates(isSearching ? results : following);
  const busy = isSearching ? searching : loadingFollowing;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/my-lists' as Href);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
      >
        <TouchableOpacity style={styles.iconBtn} onPress={back} accessibilityRole="button" accessibilityLabel={T.back}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>

        <Text style={styles.h1} accessibilityRole="header">{T.pickerTitle}</Text>
        <Text style={styles.intro}>{T.pickerIntro}</Text>

        <View style={styles.search}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M20 20l-3.5-3.5" />
          </Svg>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={T.searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={T.searchLabel}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            clearButtonMode="while-editing"
          />
        </View>

        <Text style={styles.group}>{isSearching ? T.searchResults : T.peopleYouFollow}</Text>
        {busy ? (
          <View style={styles.loader}><PlotLoader /></View>
        ) : list.length === 0 ? (
          <Text style={styles.empty}>{isSearching ? T.noResults : T.followNobody}</Text>
        ) : list.map(person => (
          <PersonRow key={person.id} person={person} colors={colors} styles={styles} />
        ))}

        <Text style={styles.privacy}>{T.privacyNote}</Text>
      </ScrollView>
    </View>
  );
}

function PersonRow({
  person, colors, styles,
}: {
  person: Candidate;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const router = useRouter();
  const name = person.display_name || person.username;
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <View style={styles.row}>
      {person.avatar_url ? (
        <Image source={{ uri: person.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.accentSecondaryFill }]}>
          <Text style={[styles.initial, { color: colors.onAccentSecondaryFill }]}>{initial}</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.detail}>{detailFor(person)}</Text>
      </View>
      {canCompare(person) ? (
        <TouchableOpacity
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel={`${T.compare}: ${name}`}
          onPress={() => router.push(`/(app)/u/${person.username}/compare` as Href)}
        >
          <Text style={styles.primaryText}>{T.compare}</Text>
        </TouchableOpacity>
      ) : person.follow_status === 'pending' ? (
        <View style={styles.pill}><Text style={styles.pillText}>{T.requestPending}</Text></View>
      ) : (
        <TouchableOpacity
          style={styles.secondary}
          accessibilityRole="button"
          onPress={() => router.push(`/(app)/u/${person.username}` as Href)}
        >
          <Text style={styles.secondaryText} numberOfLines={1}>{name}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, gap: 14 },
  iconBtn: {
    width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  h1: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.96, color: colors.textPrimary },
  intro: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingHorizontal: 14,
    borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
  },
  input: { flex: 1, fontFamily: fontFamily.sans, fontSize: 18, color: colors.textPrimary, paddingVertical: 0 },
  group: { fontFamily: fontFamily.sansBold, fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  loader: { paddingVertical: spacing.xl, alignItems: 'center' },
  empty: { fontFamily: fontFamily.sans, fontSize: 14, color: colors.textMuted },
  privacy: { marginTop: spacing.lg, fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 18, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fontFamily.display, fontSize: 16 },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamily.sansBold, fontSize: 15, color: colors.textPrimary },
  detail: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  primary: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.onAccentFill },
  secondary: { maxWidth: 120, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken },
  pillText: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.textSecondary },
});

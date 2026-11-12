// Who to compare with. Phone layout of ComparePickerPage: people you follow,
// then search. Back returns to History when this screen was opened on its own.
import { useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import SearchField from '../../components/SearchField';
import Button from '../../components/Button';
import { IconChevronLeft } from '../../components/icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlotLoader from '@plot/ui/PlotLoader';
import { useCompareCandidates } from '@plot/core/useTasteOverlap.js';
import { canCompare } from '@plot/core/tasteOverlap.js';
import { TASTE_OVERLAP as T } from '@plot/core/copy/tasteOverlap.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { fontFamily, spacing, radii, type Palette } from '../../lib/tokens';
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
          <IconChevronLeft color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.h1} accessibilityRole="header">{T.pickerTitle}</Text>
        <Text style={styles.intro}>{T.pickerIntro}</Text>

        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={T.searchPlaceholder}
          accessibilityLabel={T.searchLabel}
          autoComplete="off"
        />

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
        <Button
          variant="primary"
          size="sm"
          label={T.compare}
          accessibilityLabel={`${T.compare}: ${name}`}
          onPress={() => router.push(`/(app)/u/${person.username}/compare` as Href)}
          style={styles.action}
        />
      ) : person.follow_status === 'pending' ? (
        <View style={styles.pill}><Text style={styles.pillText}>{T.requestPending}</Text></View>
      ) : (
        <Button
          size="sm"
          label={name}
          onPress={() => router.push(`/(app)/u/${person.username}` as Href)}
          style={[styles.action, styles.nameAction]}
        />
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
  action: { alignSelf: 'center' },
  nameAction: { maxWidth: 120 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken },
  pillText: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.textSecondary },
});

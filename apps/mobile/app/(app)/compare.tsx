// Who to compare with. Phone layout of web's Compare page: the people card
// (search, then who you follow), then a sample comparison so the screen shows
// what you get before anyone is chosen. A phone has no room for web's two
// columns, so choosing a person opens the comparison as its own screen.
// Back returns to History when this screen was opened on its own.
import { useMemo, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import type { TextInput } from '../../components/TextInput';
import SearchField from '../../components/SearchField';
import Button from '../../components/Button';
import BackBar from '../../components/BackBar';
import { Tag } from '../../components/Chip';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlotLoader from '@plot/ui/PlotLoader';
import { useCompareCandidates } from '@plot/core/useTasteOverlap.js';
import { canCompare } from '@plot/core/tasteOverlap.js';
import { TASTE_OVERLAP as T } from '@plot/core/copy/tasteOverlap.js';
import { VIEW_TITLES } from '@plot/core/navigation.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { fontFamily, spacing, radii, type Palette } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import EmptyState, { EmptyNote } from '../../components/EmptyState';
import { TasteOverlapExample } from '../../components/taste/TasteOverlapView';

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

export default function ComparePickerScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAppData();
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);
  const { following, results, loadingFollowing, searching, isSearching } = useCompareCandidates(userId, query);
  const list = asCandidates(isSearching ? results : following);
  const busy = isSearching ? searching : loadingFollowing;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/my-lists' as Href);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <BackBar onBack={back} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
      >
        <Text style={styles.h1} accessibilityRole="header">{VIEW_TITLES.compare}</Text>

        <View style={styles.card}>
          <SearchField
            inputRef={searchRef}
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
            isSearching ? <EmptyNote>{T.noResults}</EmptyNote> : (
              <EmptyState
                style={styles.empty}
                title={T.followNobodyTitle}
                body={T.followNobody}
                action={<Button size="sm" label={T.searchLabel} onPress={() => searchRef.current?.focus()} />}
              />
            )
          ) : (
            <View>
              {list.map((person, index) => (
                <PersonRow key={person.id} person={person} first={index === 0} colors={colors} styles={styles} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.exampleHead}>
          <Tag label={T.exampleTag} style={styles.exampleTag} />
          <Text style={styles.h2} accessibilityRole="header">{T.youAnd(T.exampleName)}</Text>
          <Text style={styles.note}>{T.exampleNote}</Text>
        </View>
        <TasteOverlapExample />
      </ScrollView>
    </View>
  );
}

function PersonRow({
  person, first, colors, styles,
}: {
  person: Candidate;
  first: boolean;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const router = useRouter();
  const name = person.display_name || person.username;
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      {person.avatar_url ? (
        <Image source={{ uri: person.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.accentSecondaryFill }]}>
          <Text style={[styles.initial, { color: colors.onAccentSecondaryFill }]}>{initial}</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.detail} numberOfLines={1}>@{person.username}</Text>
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
        <Tag label={T.requestPending} style={styles.action} />
      ) : (
        // A private profile you have not asked to follow: its page has the Request button.
        <Button
          size="sm"
          label={T.privateProfile}
          accessibilityLabel={`${T.privateProfile}: ${name}`}
          onPress={() => router.push(`/(app)/u/${person.username}` as Href)}
          style={styles.action}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, gap: 14 },
  h1: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.96, color: colors.textPrimary },
  // The same lighter card the comparison's own sections sit on.
  card: {
    padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  group: { fontFamily: fontFamily.sansBold, fontSize: 13, color: colors.textSecondary },
  loader: { paddingVertical: spacing.xl, alignItems: 'center' },
  // The page-sized empty state would dwarf the card.
  empty: { paddingVertical: spacing.md, paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fontFamily.display, fontSize: 16 },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamily.sansBold, fontSize: 15, color: colors.textPrimary },
  detail: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  action: { alignSelf: 'center' },
  exampleHead: { gap: 6, marginTop: spacing.sm },
  exampleTag: { alignSelf: 'flex-start' },
  h2: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.5, color: colors.textPrimary },
  note: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
});

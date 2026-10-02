// The page web opens from a person in search. Follow stays on the people
// parity ticket: this screen is the destination a search row needs.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { tmdb } from '@plot/core/tmdb.js';
import { dedupedActingCredits, shortBiography, creditTitle, creditMeta, mediaType } from '@plot/core/talentCredits.js';
import { comingUpFromCredits } from '@plot/core/peopleFeed.js';
import { localDateStr, shortDayMonth } from '@plot/core/date.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { posterUrl, profileUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../../lib/tabBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { useMediaPanel } from '../../../contexts/MediaPanelContext';
import PlotLoader from '@plot/ui/PlotLoader';

type Credit = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  media_type?: string;
  character?: string;
  roles?: { character?: string }[];
  release_date?: string;
  first_air_date?: string;
};

type Person = {
  id: number;
  name?: string;
  profile_path?: string | null;
  known_for_department?: string;
  birthday?: string;
  biography?: string;
};

type ComingUp = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  role: string | null;
  date: string;
  today: boolean;
};

function paramId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export default function PersonScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const personId = paramId(params.id);
  if (personId == null) return <PersonUnavailable />;
  return <PersonBody key={personId} personId={personId} />;
}

function PersonBody({ personId }: { personId: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open: openPanel } = useMediaPanel();
  const { width } = useWindowDimensions();
  const posterW = (width - spacing.lg * 2 - spacing.md * 2) / 3;

  const [person, setPerson] = useState<Person | null>(null);
  const [credits, setCredits] = useState<{ cast?: Credit[]; crew?: Credit[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([tmdb.getPersonDetails(personId), tmdb.getPersonCredits(personId)]).then(([details, work]) => {
      if (cancelled) return;
      if (!details || !work) { setError(true); return; }
      setPerson(details);
      setCredits(work);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [personId]);

  const acting = useMemo(() => dedupedActingCredits(credits?.cast) as Credit[], [credits]);
  const comingUp = useMemo(() => comingUpFromCredits(credits, localDateStr()) as ComingUp[], [credits]);

  if (error) return <PersonUnavailable />;
  if (!person) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;

  const portrait = profileUrl(person.profile_path, 'h632');

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable
        onPress={() => router.back()}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="15,18 9,12 15,6" />
        </Svg>
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        <View style={styles.header}>
          <View style={styles.portrait}>
            {portrait
              ? <Image source={{ uri: portrait }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={person.name} />
              : <Text style={styles.portraitFallback}>{person.name?.charAt(0)}</Text>}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>{person.known_for_department || MEDIA_PANEL.talentFallback}</Text>
            <Text style={styles.name}>{person.name}</Text>
            {!!person.birthday && (
              <Text style={styles.birthday}>
                Born {new Date(person.birthday).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>
        </View>
        {!!person.biography && <Text style={styles.bio}>{shortBiography(person.biography)}</Text>}
        {comingUp.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{PEOPLE.person.comingUp}</Text>
              <Text style={styles.sectionNote}>{PEOPLE.person.comingUpNote}</Text>
            </View>
            <View style={styles.grid}>
              {comingUp.map(item => {
                const image = posterUrl(item.posterPath, 'w185');
                return (
                  <Pressable
                    key={`${item.mediaType}-${item.tmdbId}`}
                    style={{ width: posterW }}
                    onPress={() => openPanel(item.tmdbId, item.mediaType)}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                  >
                    <View style={[styles.poster, { height: posterW * 1.5 }]}>
                      {image
                        ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <Text style={styles.posterFallback}>{item.title}</Text>}
                    </View>
                    <Text style={styles.creditTitle} numberOfLines={1}>{item.title}</Text>
                    {!!item.role && <Text style={styles.creditRole} numberOfLines={1}>{item.role}</Text>}
                    <Text style={[styles.creditMeta, item.today && { color: colors.chipToday }]} numberOfLines={1}>
                      {item.today ? PEOPLE.chips.outToday : shortDayMonth(item.date)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <View style={styles.section}>
          {comingUp.length > 0 && (
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{PEOPLE.person.allCredits}</Text>
            </View>
          )}
          <View style={styles.grid}>
            {acting.map(credit => {
              const type = mediaType(credit) === 'tv' ? 'tv' as const : 'movie' as const;
              const title = creditTitle(credit);
              const role = credit.character || credit.roles?.[0]?.character;
              const image = posterUrl(credit.poster_path, 'w185');
              return (
                <Pressable
                  key={`${type}-${credit.id}`}
                  style={{ width: posterW }}
                  onPress={() => openPanel(credit.id, type)}
                  accessibilityRole="button"
                  accessibilityLabel={title}
                >
                  <View style={[styles.poster, { height: posterW * 1.5 }]}>
                    {image
                      ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      : <Text style={styles.posterFallback}>{title}</Text>}
                  </View>
                  <Text style={styles.creditTitle} numberOfLines={1}>{title}</Text>
                  {!!role && <Text style={styles.creditRole} numberOfLines={1}>{role}</Text>}
                  <Text style={styles.creditMeta} numberOfLines={1}>{creditMeta(credit, type)}</Text>
                </Pressable>
              );
            })}
          </View>
          {acting.length === 0 && <Text style={styles.muted}>No screen credits available.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

function PersonUnavailable() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.screen, styles.error, { paddingTop: insets.top }]}>
      <Text style={styles.errorTitle}>Couldn’t load talent</Text>
      <Text style={styles.errorBody}>Check your connection and try again.</Text>
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.errorBack}>Go back</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { width: 32, height: 32, marginLeft: spacing.md, marginBottom: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  error: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, textAlign: 'center' },
  errorBody: { marginTop: spacing.sm, marginBottom: spacing.lg, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  errorBack: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accentText },
  header: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  portrait: {
    width: 100,
    height: 150,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitFallback: { fontFamily: fontFamily.display, fontSize: 40, color: colors.textMuted },
  headerText: { flex: 1, minWidth: 0 },
  kicker: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  name: { marginTop: 4, fontFamily: fontFamily.display, fontSize: 32, lineHeight: 32, letterSpacing: -0.8, color: colors.textPrimary },
  birthday: { marginTop: 4, fontFamily: fontFamily.sans, fontSize: 13, color: colors.textMuted },
  bio: { marginTop: 28, marginBottom: spacing.xl, fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 25, color: colors.textSecondary },
  section: { marginTop: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, lineHeight: 23, color: colors.textPrimary },
  sectionNote: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  poster: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  posterFallback: { padding: spacing.sm, fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  creditTitle: { marginTop: 10, fontFamily: fontFamily.sansMedium, fontSize: 12, color: colors.textPrimary },
  creditRole: { marginTop: 2, fontFamily: fontFamily.sans, fontSize: 11, color: colors.textSecondary },
  creditMeta: { marginTop: 2, fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted },
  muted: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
});

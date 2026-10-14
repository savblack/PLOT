import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Dimensions, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { tmdb } from '../../../lib/tmdb';
import { posterUrl, profileUrl, fontFamily, fontSize, spacing, radii } from '../../../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import CustomizeArtwork from '../../../components/ArtworkSheet';
import { useTheme } from '../../../contexts/ThemeContext';
import { useMediaPanel } from '../../../contexts/MediaPanelContext';
import { TAB_BAR_CLEARANCE } from '../../../lib/tabBar';
import { PEOPLE as P } from '@plot/core/copy/people.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { comingUpFromCredits } from '@plot/core/peopleFeed.js';
import {
  creditTitle,
  mediaType,
  creditMeta,
  shortBiography,
  dedupedActingCredits,
} from '@plot/core/talentCredits.js';
import { localDateStr, shortDayMonth } from '@plot/core/date.js';
import { FollowPill, PeopleChip } from '../../../components/people/FollowControls';
import { useFollowPerson, type FollowTarget } from '../../../components/people/useFollowPerson';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = (SCREEN_W - spacing.xl * 2 - spacing.md * 2) / 3;

interface Credit {
  id?: number;
  title?: string;
  name?: string;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  character?: string;
  roles?: { character?: string }[];
  popularity?: number;
}

interface PersonDetails extends FollowTarget {
  biography?: string;
  birthday?: string | null;
}

function PersonFollow({ person }: { person: PersonDetails }) {
  const f = useFollowPerson();
  const router = useRouter();
  const { colors } = useTheme();
  if (!f.signedIn || !person?.id || !person?.name) return null;
  const following = f.isFollowing(person.id);
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
        <FollowPill following={following} busy={f.busyId === person.id} name={person.name} onPress={() => f.toggle(person)} />
        {following ? (
          <TouchableOpacity onPress={() => router.push('/(app)/your-people' as Href)} accessibilityRole="button">
            <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent }}>{P.page.title}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{P.explainer}</Text>
        )}
      </View>
      {f.failed && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{P.error}</Text>}
      {f.sheet}
    </View>
  );
}

function CreditCard({ title, image, role, meta, onPress }: {
  title: string;
  image: string | null;
  role?: string | null;
  meta: ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={{ width: CARD_W }} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={{ width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken }}>
        {image ? <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : (
          <View style={{ flex: 1, padding: spacing.xs, justifyContent: 'flex-end' }}>
            <Text style={{ fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted }} numberOfLines={4}>{title}</Text>
          </View>
        )}
      </View>
      <Text style={{ marginTop: spacing.xs, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary }} numberOfLines={2}>{title}</Text>
      {!!role && <Text style={{ fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted }} numberOfLines={2}>{role}</Text>}
      {typeof meta === 'string'
        ? <Text style={{ fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted }} numberOfLines={2}>{meta}</Text>
        : <View style={{ marginTop: 2 }}>{meta}</View>}
    </TouchableOpacity>
  );
}

export default function PersonScreen() {
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const raw = Array.isArray(personId) ? personId[0] : personId;
  return <PersonBody key={raw ?? ''} personId={raw ?? ''} />;
}

function PersonBody({ personId }: { personId: string }) {
  const id = Number(personId);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { open } = useMediaPanel();
  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [credits, setCredits] = useState<{ cast?: Credit[]; crew?: Credit[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    Promise.all([tmdb.getPersonDetails(id), tmdb.getPersonCredits(id)]).then(([details, work]) => {
      if (cancelled) return;
      if (!details || !work) { setError(true); return; }
      setPerson(details);
      setCredits(work);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [id]);

  const actingCredits = useMemo(() => dedupedActingCredits(credits?.cast), [credits]);
  const comingUp = useMemo(() => comingUpFromCredits(credits, localDateStr()), [credits]);
  const art = useUserArtwork();

  if (!Number.isFinite(id) || error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: spacing.xl, justifyContent: 'center' }}>
        <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary }}>Couldn’t load talent</Text>
        <Text style={{ marginTop: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>Check your connection and try again.</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" style={{ marginTop: spacing.lg, alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!person) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const image = profileUrl(art.path('person', person.id, 'profile') || person.profile_path, 'h632');
  const knownFor = person.known_for_department || MEDIA_PANEL.talentFallback;
  const biography = shortBiography(person.biography);
  const born = person.birthday
    ? new Date(person.birthday).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginLeft: spacing.md, marginVertical: spacing.sm, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke={colors.textPrimary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.xl }}>
        <View style={{ width: 100, height: 150, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken }}>
          {image
            ? <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={person.name} />
            : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textMuted }}>{person.name?.charAt(0)}</Text></View>}
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted }}>{knownFor}</Text>
          <Text style={{ marginTop: spacing.xs, fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary }}>{person.name}</Text>
          {!!born && <Text style={{ marginTop: spacing.xs, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>Born {born}</Text>}
          <PersonFollow person={person} />
          <CustomizeArtwork mediaType="person" tmdbId={person.id} defaults={{ profile: person.profile_path }} />
        </View>
      </View>
      {!!biography && (
        <Text style={{ marginTop: spacing.lg, paddingHorizontal: spacing.xl, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary }}>{biography}</Text>
      )}
      {comingUp.length > 0 && (
        <View style={{ marginTop: spacing.xl }}>
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textPrimary }}>{P.person.comingUp}</Text>
            <Text style={{ marginTop: 2, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{P.person.comingUpNote}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
            {comingUp.map(item => (
              <CreditCard
                key={`${item.mediaType}-${item.tmdbId}`}
                title={item.title}
                image={posterUrl(displayPosterPath(art.apply(item)), 'w185')}
                role={item.role}
                meta={item.today ? <PeopleChip label={P.chips.outToday} tone="today" /> : shortDayMonth(item.date)}
                onPress={() => open(item.tmdbId, item.mediaType)}
              />
            ))}
          </ScrollView>
        </View>
      )}
      <View style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xl }}>
        {comingUp.length > 0 && (
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textPrimary, marginBottom: spacing.md }}>{P.person.allCredits}</Text>
        )}
        {actingCredits.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {actingCredits.map((credit: Credit) => {
              const type = mediaType(credit);
              const title = creditTitle(credit);
              const role = credit.character || credit.roles?.[0]?.character;
              return (
                <CreditCard
                  key={`${type}-${credit.id}`}
                  title={title}
                  image={posterUrl(displayPosterPath(art.apply({ ...credit, media_type: type })), 'w185')}
                  role={role}
                  meta={creditMeta(credit, type)}
                  onPress={() => credit.id && open(credit.id, type)}
                />
              );
            })}
          </View>
        ) : (
          <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>No screen credits available.</Text>
        )}
      </View>
    </ScrollView>
  );
}

import { useMemo, type ReactNode } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useContinueWatching, usePeopleSuggestions } from '@plot/core/useHomeShelves.js';
import { usePeopleFeed, usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { feedItems } from '@plot/core/peopleFeed.js';
import { localDateStr, shortDayMonth } from '@plot/core/date.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { PEOPLE as P } from '@plot/core/copy/people.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { formatDuration } from '@plot/core/historyStats.js';
import { tmdb } from '../../lib/tmdb';
import { posterUrl, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { FollowPill, PeopleChip, PersonFace } from './FollowControls';
import { useFollowPerson } from './useFollowPerson';

const CARD_W = 112;

const fetchTv = (id: number) => tmdb.getTVDetails(id);
const fetchTitle = (type: 'movie' | 'tv', id: number) =>
  type === 'tv' ? tmdb.getTVDetails(id) : tmdb.getMovieDetails(id);

const byWatchedDesc = (a: { watched_at?: string }, b: { watched_at?: string }) =>
  String(b.watched_at ?? '').localeCompare(String(a.watched_at ?? ''));

function chipTone(chip: string): 'today' | 'quiet' | 'default' {
  if (chip === 'outToday') return 'today';
  if (chip === 'dated') return 'quiet';
  return 'default';
}

function ShelfHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text style={{ flex: 1, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textPrimary }}>{title}</Text>
        {right}
      </View>
      {!!subtitle && (
        <Text style={{ marginTop: 2, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{subtitle}</Text>
      )}
    </View>
  );
}

function Poster({ path }: { path?: string | null }) {
  const { colors } = useTheme();
  const uri = posterUrl(path, 'w185');
  return (
    <View style={{ width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

export type ContinueWatchingItem = ReturnType<typeof useContinueWatching>['items'][number];

/** One show in Continue watching: poster, progress line, title, what is next. Home's Up next reuses it. */
export function ContinueWatchingCard({ item }: { item: ContinueWatchingItem }) {
  const { colors } = useTheme();
  const { open } = useMediaPanel();
  const line = item.latest
    ? P.continueWatching.isOut(item.season, item.episode)
    : P.continueWatching.next(item.season, item.episode);
  const width = `${Math.round(Math.min(1, Math.max(0, item.progress)) * 100)}%` as `${number}%`;
  return (
    <TouchableOpacity
      style={{ width: CARD_W }}
      onPress={() => open(item.tmdbId, 'tv')}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <Poster path={item.posterPath} />
      <View style={{ height: 3, marginTop: 6, borderRadius: radii.pill, backgroundColor: colors.borderStrong, overflow: 'hidden' }}>
        <View style={{ width, height: '100%', backgroundColor: colors.accent }} />
      </View>
      <Text style={{ marginTop: spacing.sm, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary }} numberOfLines={2}>{item.title}</Text>
      <Text style={{ marginTop: 2, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={1}>{line}</Text>
      {item.minutesLeft != null && item.minutesLeft > 0 && (
        <Text style={{ marginTop: 2, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={1}>
          {MEDIA_PANEL.timeLeft(formatDuration(item.minutesLeft))}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export const fetchContinueWatchingTv = fetchTv;

export function ContinueWatchingShelf() {
  const { watching } = useAppData();
  const { items } = useContinueWatching(watching.items ?? [], fetchTv);
  if (!items.length) return null;
  return (
    <View style={{ marginTop: spacing.xl }}>
      <ShelfHeader title={P.continueWatching.title} subtitle={P.continueWatching.subtitle} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={item => String(item.tmdbId)}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        renderItem={({ item }) => <ContinueWatchingCard item={item} />}
      />
    </View>
  );
}

function shelfMeta(item: { people: { name: string }[]; date?: string | null; network?: string | null }, today: string) {
  const who = item.people.map(p => p.name).join(', ');
  const tail = item.date && item.date > today ? shortDayMonth(item.date) : item.network;
  return tail ? `${who} · ${tail}` : who;
}

function reason(s: { kind: string; count: number; title: string }) {
  if (s.kind === 'directed') return s.count > 1 ? P.shelf.directed(s.count) : P.shelf.directedOne(s.title);
  return s.count > 1 ? P.shelf.actedIn(s.count) : P.shelf.actedInOne(s.title);
}

function PeopleInvite({ suggestions }: {
  suggestions: { id: number; name: string; profilePath: string | null; kind: string; count: number; title: string }[];
}) {
  const follow = useFollowPerson();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View>
      <ShelfHeader title={P.shelf.title} subtitle={P.shelf.inviteSubtitle} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md }}>
        {suggestions.map(s => (
          <View key={s.id} style={{ width: '50%', alignItems: 'center', paddingHorizontal: spacing.sm, paddingBottom: spacing.lg, gap: spacing.xs }}>
            <TouchableOpacity
              onPress={() => router.push(`/(app)/person/${s.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={P.viewLabel(s.name)}
            >
              <PersonFace name={s.name} path={s.profilePath} size={64} />
            </TouchableOpacity>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary, textAlign: 'center' }} numberOfLines={2}>{s.name}</Text>
            <Text style={{ minHeight: 32, fontFamily: fontFamily.sans, fontSize: 11, lineHeight: 14, color: colors.textMuted, textAlign: 'center' }} numberOfLines={2}>{reason(s)}</Text>
            <FollowPill
              following={follow.isFollowing(s.id)}
              busy={follow.busyId === s.id}
              name={s.name}
              onPress={() => follow.toggle({
                id: s.id,
                name: s.name,
                profile_path: s.profilePath,
                known_for_department: s.kind === 'directed' ? 'Directing' : 'Acting',
              })}
            />
          </View>
        ))}
      </View>
      {follow.sheet}
    </View>
  );
}

export function YourPeopleShelf() {
  const { colors } = useTheme();
  const router = useRouter();
  const { open } = useMediaPanel();
  const { userId, profile, history } = useAppData();
  const premium = profile != null && isPremiumProfile(profile);
  const people = usePeopleFollows(premium ? userId : null);
  const today = localDateStr();
  const ids = useMemo(() => people.follows.map((f: { tmdb_person_id: number }) => f.tmdb_person_id), [people.follows]);
  const { rows } = usePeopleFeed(ids, { today, version: people.feedVersion });
  const region = profile?.region || DEFAULT_REGION;
  const items = useMemo(() => feedItems(rows, { region, today }).slice(0, 20), [rows, region, today]);
  const emptyFollows = premium && !people.loading && people.follows.length === 0;
  const logged = useMemo(
    () => (emptyFollows ? [...(history.entries ?? [])].sort(byWatchedDesc) : []),
    [emptyFollows, history.entries],
  );
  const followed = useMemo(() => new Set<number>(ids), [ids]);
  const { suggestions } = usePeopleSuggestions(logged, fetchTitle, { enabled: emptyFollows, exclude: followed });

  if (!premium || people.loading) return null;
  if (people.follows.length === 0) {
    if (!suggestions.length) return null;
    return (
      <View style={{ marginTop: spacing.xl }}>
        <PeopleInvite suggestions={suggestions} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: spacing.xl }}>
      <ShelfHeader
        title={P.shelf.title}
        subtitle={P.shelf.subtitle(people.follows.length)}
        right={(
          <TouchableOpacity
            onPress={() => router.push('/(app)/your-people' as Href)}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent }}>{P.shelf.seeAll}</Text>
          </TouchableOpacity>
        )}
      />
      {items.length === 0 ? (
        <Text style={{ paddingHorizontal: spacing.xl, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{P.shelf.empty}</Text>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={item => item.key}
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ width: CARD_W }}
              onPress={() => open(item.tmdbId, item.mediaType === 'movie' ? 'movie' : 'tv')}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <Poster path={item.posterPath} />
              <Text style={{ marginTop: spacing.sm, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary }} numberOfLines={2}>{item.title}</Text>
              <Text style={{ marginTop: 2, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={2}>{shelfMeta(item, today)}</Text>
              {!!item.chip && (
                <View style={{ marginTop: 6 }}>
                  <PeopleChip label={P.chips[item.chip as keyof typeof P.chips]} tone={chipTone(item.chip)} />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

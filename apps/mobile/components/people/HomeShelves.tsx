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
import { displayPosterPath, feedDisplayItem } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { FollowPill, PeopleChip, PersonFace } from './FollowControls';
import { useFollowPerson } from './useFollowPerson';
import { useHomePosterScale } from '../../lib/homeLook';
import PosterRail, { useRowLayout } from '../PosterRail';
import ListRow from '../ListRow';
import { normalizeHomeLayout } from '@plot/core/homeLayout.js';
import { usePinnedShelves } from '@plot/core/usePinnedShelves.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';

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
  const scale = useHomePosterScale();
  const uri = posterUrl(path, 'w185');
  return (
    <View style={{ width: CARD_W * scale, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

/**
 * A title on a poster rail: the poster card with a title and detail lines under
 * it, or, inside a PosterRail drawing rows (the List card style), a ListRow.
 */
function PosterTile({ path, title, meta, metaLines = 1, chip, onPress }: {
  path?: string | null;
  title: string;
  meta?: string;
  metaLines?: number;
  chip?: ReactNode;
  onPress: () => void;
}) {
  const row = useRowLayout();
  const scale = useHomePosterScale();
  const { colors } = useTheme();
  if (row) {
    return <ListRow posterUri={posterUrl(path, 'w185')} title={title} meta={meta} onPress={onPress} trailing={chip} />;
  }
  return (
    <TouchableOpacity style={{ width: CARD_W * scale }} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <Poster path={path} />
      <Text style={{ marginTop: spacing.sm, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary }} numberOfLines={2}>{title}</Text>
      {!!meta && <Text style={{ marginTop: 2, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={metaLines}>{meta}</Text>}
      {!!chip && <View style={{ marginTop: 6 }}>{chip}</View>}
    </TouchableOpacity>
  );
}

export type ContinueWatchingItem = ReturnType<typeof useContinueWatching>['items'][number];

/** One show in Continue watching: poster, progress line, title, what is next. Home's Up next reuses it. */
export function ContinueWatchingCard({ item }: { item: ContinueWatchingItem }) {
  const row = useRowLayout();
  const scale = useHomePosterScale();
  const art = useUserArtwork();
  const { colors } = useTheme();
  const { open } = useMediaPanel();
  const line = item.latest
    ? P.continueWatching.isOut(item.season, item.episode)
    : P.continueWatching.next(item.season, item.episode);
  const width = `${Math.round(Math.min(1, Math.max(0, item.progress)) * 100)}%` as `${number}%`;
  if (row) {
    const timeLeft = item.minutesLeft != null && item.minutesLeft > 0 ? MEDIA_PANEL.timeLeft(formatDuration(item.minutesLeft)) : '';
    return (
      <ListRow
        posterUri={posterUrl(displayPosterPath(art.apply(item)), 'w185')}
        title={item.title}
        meta={[line, timeLeft].filter(Boolean).join(' · ')}
        progress={item.progress}
        onPress={() => open(item.tmdbId, 'tv')}
      />
    );
  }
  return (
    <TouchableOpacity
      style={{ width: CARD_W * scale }}
      onPress={() => open(item.tmdbId, 'tv')}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <Poster path={displayPosterPath(art.apply(item))} />
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
  const art = useUserArtwork();
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
              <PersonFace name={s.name} path={art.path('person', s.id, 'profile') || s.profilePath} size={64} />
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
  const art = useUserArtwork();
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
        <PosterRail
          data={items}
          keyExtractor={item => item.key}
          renderItem={({ item }) => (
            <PosterTile
              path={displayPosterPath(art.apply(feedDisplayItem(item)))}
              title={item.title}
              meta={shelfMeta(item, today)}
              metaLines={2}
              chip={item.chip ? <PeopleChip label={P.chips[item.chip as keyof typeof P.chips]} tone={chipTone(item.chip)} /> : undefined}
              onPress={() => open(item.tmdbId, item.mediaType === 'movie' ? 'movie' : 'tv')}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * Pinned shelves (Premium): what the viewer chose to keep at the top of Home.
 * Rules and data are shared with web (@plot/core/homeLayout.js, homePins.js,
 * usePinnedShelves.js). A Free or lapsed viewer sees none, and their saved pins
 * stay saved. Reads the layout from the profile; the Customize Home screen is
 * where it is written.
 */
export function PinnedShelves() {
  const art = useUserArtwork();
  const { colors } = useTheme();
  const { open } = useMediaPanel();
  const { userId, profile, watchlist, watching, customLists } = useAppData();
  const premium = profile != null && isPremiumProfile(profile);
  const layout = useMemo(() => normalizeHomeLayout(profile?.home_layout), [profile?.home_layout]);
  const today = localDateStr();
  const { shelves } = usePinnedShelves({
    userId,
    layout,
    premium,
    watchlistItems: watchlist.items ?? [],
    watchingItems: watching.items ?? [],
    lists: customLists?.lists ?? [],
    region: profile?.region || DEFAULT_REGION,
    today,
  });
  if (!shelves.length) return null;
  const empty = (text: string) => (
    <Text style={{ paddingHorizontal: spacing.xl, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{text}</Text>
  );
  return (
    <>
      {shelves.map(shelf => (
        <View key={shelf.key} style={{ marginTop: spacing.xl }}>
          <ShelfHeader title={shelf.label} />
          {shelf.kind === 'person' ? (
            shelf.people.length === 0 ? empty(DISCOVER_VIEW.customize.pinnedPersonEmpty) : (
              <PosterRail
                data={shelf.people}
                keyExtractor={item => item.key}
                renderItem={({ item }) => (
                  <PosterTile
                    path={displayPosterPath(art.apply(feedDisplayItem(item)))}
                    title={item.title}
                    meta={shelfMeta(item, today)}
                    metaLines={2}
                    onPress={() => open(item.tmdbId, item.mediaType === 'movie' ? 'movie' : 'tv')}
                  />
                )}
              />
            )
          ) : shelf.titles.length === 0 ? empty(DISCOVER_VIEW.customize.pinnedListEmpty) : (
            <PosterRail
              data={shelf.titles}
              keyExtractor={item => `${item.media_type}-${item.id}`}
              renderItem={({ item }) => (
                <PosterTile
                  path={displayPosterPath(art.apply(item))}
                  title={item.title}
                  onPress={() => open(item.id, item.media_type === 'tv' ? 'tv' : 'movie')}
                />
              )}
            />
          )}
        </View>
      ))}
    </>
  );
}

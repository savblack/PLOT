import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { usePeopleFeed, usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { feedItems, filterFeedByType, groupByDate, groupByPerson } from '@plot/core/peopleFeed.js';
import { localDateStr, monthLongName, shortDayMonth, weekdayDayMonth } from '@plot/core/date.js';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { PEOPLE as P } from '@plot/core/copy/people.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { CALENDAR_VIEW } from '@plot/core/copy/calendarView.js';
import { tmdb } from '../../lib/tmdb';
import { posterUrl, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { displayPosterPath, feedDisplayItem } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { FollowPill, PeopleChip, PersonFace } from '../../components/people/FollowControls';
import { useFollowPerson } from '../../components/people/useFollowPerson';

const TYPE_ROWS = [
  { id: 'tv', label: MEDIA.tv },
  { id: 'movie', label: MEDIA.movies },
  { id: 'cinema', label: MEDIA.cinema },
];

type FeedItem = ReturnType<typeof feedItems>[number];

function chipTone(chip: string): 'today' | 'quiet' | 'default' {
  if (chip === 'outToday') return 'today';
  if (chip === 'dated') return 'quiet';
  return 'default';
}

function peopleLine(item: FeedItem) {
  return item.people.map(p => p.role === 'director' ? `${p.name}, ${P.page.directing}`
    : p.role === 'creator' ? `${p.name}, ${P.page.creating}` : p.name).join(' · ');
}

function whenLine(item: FeedItem, today: string) {
  if (!item.date) return '';
  if (item.date >= today) return weekdayDayMonth(item.date);
  if (item.mediaType === 'tv' && item.premiereDrop === 1) return P.page.weeklySince(shortDayMonth(item.date));
  return P.page.since(shortDayMonth(item.date));
}

function BookmarkIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function FeedRow({ item, today, saved, onSave, onOpen }: {
  item: FeedItem;
  today: string;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const art = useUserArtwork();
  const poster = posterUrl(displayPosterPath(art.apply(feedDisplayItem(item))), 'w92');
  const chips: { key: string; tone: 'today' | 'quiet' | 'default'; label: string }[] = [];
  if (item.chip) chips.push({ key: 'chip', tone: chipTone(item.chip), label: P.chips[item.chip] });
  if (item.chip !== 'newSeason' && item.kind === 'season') chips.push({ key: 'season', tone: 'default', label: P.chips.newSeason });
  if (item.network) chips.push({ key: 'net', tone: 'quiet', label: item.network });
  const drop = item.premiereDrop;
  if (item.mediaType === 'tv' && drop != null && drop > 1) chips.push({ key: 'drop', tone: 'quiet', label: P.page.allEpisodes(drop) });
  const title = `${item.title}${item.kind === 'season' ? ` · ${P.page.season(item.season)}` : ''}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
      <TouchableOpacity onPress={onOpen} accessibilityRole="button" accessibilityLabel={title} style={{ flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        {poster
          ? <Image source={{ uri: poster }} style={{ width: 40, height: 60, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken }} />
          : <View style={{ width: 40, height: 60, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken }} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={1}>{peopleLine(item)}</Text>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={2}>{title}</Text>
          {chips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {chips.map(c => <PeopleChip key={c.key} label={c.label} tone={c.tone} />)}
            </View>
          )}
          {!!whenLine(item, today) && (
            <Text style={{ marginTop: 2, fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted }}>{whenLine(item, today)}</Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSave}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? P.page.saved : P.page.save}
        style={{ minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        <BookmarkIcon color={saved ? colors.accent : colors.textPrimary} />
        <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: saved ? colors.accent : colors.textPrimary }}>{saved ? P.page.saved : P.page.save}</Text>
      </TouchableOpacity>
    </View>
  );
}

function FollowSearch({ follow }: { follow: ReturnType<typeof useFollowPerson> }) {
  const art = useUserArtwork();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: number; name: string; profile_path?: string | null; known_for_department?: string | null }[] | null>(null);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      tmdb.searchPeople(term).then(data => {
        if (!active) return;
        const people = (data?.results ?? []).filter((p: { id?: number; name?: string }) => p?.id && p?.name).slice(0, 6);
        setResults(people);
      }).catch(() => { if (active) setResults([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  const shown = query.trim().length >= 2 ? results : null;
  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={7} stroke={colors.textMuted} strokeWidth={2} />
          <Line x1={16.5} y1={16.5} x2={21} y2={21} stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={P.page.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={P.page.searchLabel}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary, paddingVertical: spacing.sm }}
        />
      </View>
      {shown && (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          {shown.length === 0 && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{P.page.noResults}</Text>}
          {shown.map(person => (
            <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <PersonFace name={person.name} path={art.path('person', person.id, 'profile') || person.profile_path} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{person.name}</Text>
                {!!person.known_for_department && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }}>{person.known_for_department}</Text>}
              </View>
              <FollowPill
                following={follow.isFollowing(person.id)}
                busy={follow.busyId === person.id}
                name={person.name}
                onPress={() => follow.toggle(person)}
              />
            </View>
          ))}
        </View>
      )}
      {follow.failed && <Text style={{ marginTop: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{P.error}</Text>}
    </View>
  );
}

export default function YourPeopleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, userId, watchlist } = useAppData();
  const art = useUserArtwork();
  const { open } = useMediaPanel();
  const people = usePeopleFollows(userId);
  const follow = useFollowPerson();
  const [view, setView] = useState<'date' | 'person'>('date');
  const [typeFilters, setTypeFilters] = useState<string[]>([...ALL_TYPES]);
  const today = localDateStr();
  const ids = useMemo(() => people.follows.map((f: { tmdb_person_id: number }) => f.tmdb_person_id), [people.follows]);
  const { rows, loading } = usePeopleFeed(ids, { today, version: people.feedVersion });
  const items = useMemo(
    () => feedItems(rows, { region: profile?.region || DEFAULT_REGION, today }),
    [rows, profile?.region, today],
  );
  const filtered = filterFeedByType(items, typeFilters);
  const todayYear = Number(today.slice(0, 4));
  const sections = view === 'person'
    ? groupByPerson(filtered, people.follows).map(g => ({ key: `p${g.person.id}`, title: g.person.name, items: g.items }))
    : groupByDate(filtered).map(g => ({
      key: g.key,
      title: g.key === 'out' ? P.page.outNow : monthLongName(Number(g.key.slice(0, 4)), Number(g.key.slice(5, 7)) - 1, todayYear),
      items: g.items,
    }));
  const busy = people.loading || loading;

  const toggleType = (id: string) => {
    if (typeFilters.includes(id)) {
      if (typeFilters.length > 1) setTypeFilters(typeFilters.filter(t => t !== id));
    } else {
      setTypeFilters([...typeFilters, id]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={{ padding: 4 }}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 18l-6-6 6-6" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary }}>{P.page.title}</Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{P.page.subtitle}</Text>
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', marginTop: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {(['date', 'person'] as const).map(id => {
            const on = view === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setView(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: on ? colors.accentFill : colors.bg }}
              >
                <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: on ? colors.onAccentFill : colors.textPrimary }}>
                  {id === 'date' ? P.page.byDate : P.page.byPerson}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textPrimary }}>{P.page.followingTitle}</Text>
            <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }}>{P.page.peopleCount(people.follows.length)}</Text>
          </View>
          <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            {people.follows.map((f: { tmdb_person_id: number; name: string; profile_path?: string | null; known_for?: string | null }) => (
              <View key={f.tmdb_person_id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <TouchableOpacity
                  onPress={() => router.push(`/(app)/person/${f.tmdb_person_id}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={P.viewLabel(f.name)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                >
                  <PersonFace name={f.name} path={art.path('person', f.tmdb_person_id, 'profile') || f.profile_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{f.name}</Text>
                    <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }}>{f.known_for === 'Directing' ? P.page.directingDept : P.page.acting}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => people.unfollow(f.tmdb_person_id)}
                  accessibilityRole="button"
                  accessibilityLabel={P.unfollow}
                  style={{ minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary }}>{P.unfollow}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <FollowSearch follow={follow} />
        </View>

        <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.sm }}>{CALENDAR_VIEW.filter.show}</Text>
          {TYPE_ROWS.map(row => {
            const on = typeFilters.includes(row.id);
            return (
              <TouchableOpacity
                key={row.id}
                onPress={() => toggleType(row.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}
              >
                <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: on ? colors.textPrimary : colors.textMuted }}>{row.label}</Text>
                {on && (
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Polyline points="20 6 9 17 4 12" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ marginTop: spacing.lg }}>
          {busy && sections.length === 0 && <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xl }} />}
          {!busy && people.follows.length === 0 && (
            <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{P.page.empty}</Text>
          )}
          {!busy && people.follows.length > 0 && sections.length === 0 && (
            <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{P.page.nothing}</Text>
          )}
          {sections.map(section => (
            <View key={section.key} style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textPrimary }}>{section.title}</Text>
                <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }}>{P.page.titleCount(section.items.length)}</Text>
              </View>
              {section.items.map(item => (
                <FeedRow
                  key={item.key}
                  item={item}
                  today={today}
                  saved={watchlist.isInList(item.tmdbId)}
                  onSave={() => watchlist.toggle({
                    id: item.tmdbId,
                    tmdb_id: item.tmdbId,
                    media_type: item.mediaType,
                    title: item.title,
                    name: item.title,
                    poster_path: item.posterPath,
                  })}
                  onOpen={() => open(item.tmdbId, item.mediaType)}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {follow.sheet}
    </View>
  );
}

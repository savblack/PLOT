import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { personName, filterByKind, splitGroupMatches, shufflePick } from '@plot/core/watchTogether.js';
import { startWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { COMMON } from '@plot/core/copy/common.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { supabase } from '@plot/core/supabase.js';
import { EVENTS, track } from '../../lib/analytics';
import { fontFamily, fontSize, spacing, posterUrl } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import UpgradeSheet from '../UpgradeSheet';
import ListRow from '../ListRow';
import Chip from '../Chip';
import { ShareListSheet } from './ShareListSheet';
import { WatchTogetherTile } from './WatchTogetherTile';
import Button from '../Button';
import SectionTitle from '../SectionTitle';
import { Avatar } from '../Avatar';
import { ButtonRow, ErrorNote, Note, PosterThumb, SectionLabel, WatchPage, openPremium, useOpenTitle } from './WatchChrome';
import { WtPerson, WtTitle, asPerson, asResult, errorText, sessionIdFrom, titleMeta, useTogether, useTogetherTitles } from './watchModel';

export function WatchOverlap({ usernames }: { usernames: string[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const openTitle = useOpenTitle();
  const { userId, profile, customLists } = useAppData();
  const together = useTogether(userId);
  const people = usernames.flatMap(name => {
    const person = together.partners.find(row => row.username === name);
    return person ? [person] : [];
  });
  const { titles, loading, error } = useTogetherTitles(people.map(person => person.id));
  const [kind, setKind] = useState<'all' | 'movie' | 'tv'>('all');
  const [topId, setTopId] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const locked = error === 'premium_required';
  const group = people.length > 1;
  const shown = filterByKind(titles, kind);
  const top = shown.find(title => title.tmdb_id === topId) || shown[0] || null;
  const rest = shown.filter(title => title !== top);
  const split = splitGroupMatches(shown, people.length + 1);

  useEffect(() => {
    if (locked) track(EVENTS.PREMIUM_GATE_HIT, { feature: 'watch_together' });
  }, [locked]);

  if (!together.loading && people.length !== usernames.length) {
    if (usernames.length === 1 && usernames[0]) return <NotPairedYet username={usernames[0]} refresh={together.refresh} />;
    return <WatchPage><Note>{T.overlap.notPartners}</Note></WatchPage>;
  }
  if (together.loading && !people.length) return <WatchPage><Note>{COMMON.loading}</Note></WatchPage>;

  const partner = people[0];
  const lists = Array.isArray(customLists.lists) ? customLists.lists as { id: string; name: string; items?: unknown[]; people?: { user_id?: string }[] }[] : [];
  const existing = !group && partner ? lists.find(list => list.people?.some(member => member.user_id === partner.id)) : undefined;
  const nameOf = (id: string) => id === userId ? T.overlap.you : personName(people.find(person => person.id === id) || {});
  const decide = async () => {
    if (!partner) return;
    const result = asResult(await startWatchTogetherSession(partner.id));
    const id = sessionIdFrom(result);
    if (id) router.push(`/(app)/together/session/${id}` as Href);
    else setActionError(errorText(result.code));
  };
  const makeList = () => {
    if (!isPremiumProfile(profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'collaborative_lists' });
      setUpgrade(true);
      return;
    }
    setSharing(true);
  };

  return (
    <WatchPage>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {people.slice(0, 3).map(person => <Avatar key={person.id} url={person.avatar_url} name={personName(person)} size={28} colors={colors} />)}
        <Note>{group ? T.overlap.group(people.map(personName)) : T.overlap.pair(personName(partner || {}))}</Note>
      </View>
      <SectionTitle>{group ? T.overlap.groupHeading : T.overlap.heading(titles.length)}</SectionTitle>
      {!group && titles.length > 0 && <Button variant="primary" label={T.session.start} onPress={decide} />}
      {!!actionError && <ErrorNote>{actionError}</ErrorNote>}
      {locked && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>{T.locked.title}</SectionTitle>
          <Note>{T.locked.body(group ? T.overlap.everyone : personName(partner || {}))}</Note>
          <ButtonRow>
            <Button variant="primary" label={T.start.getPremium} onPress={() => openPremium(router)} />
          </ButtonRow>
          <Note>{PLANS_PAGE.premium.priceSummary}</Note>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.sm }} accessibilityRole="tablist">
        {([['all', T.overlap.all], ['movie', T.overlap.movies], ['tv', T.overlap.shows]] as const).map(([id, label]) => {
          const on = kind === id;
          return (
            <Chip key={id} label={label} selected={on} onPress={() => { setKind(id); setTopId(null); }} />
          );
        })}
      </View>
      {!!error && !locked && <ErrorNote>{errorText(error)}</ErrorNote>}
      {loading ? <Note>{COMMON.loading}</Note>
        : locked ? null
        : !shown.length ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{T.overlap.emptyTitle}</Text>
            <Note>{T.overlap.emptyBody(group ? T.overlap.everyone : personName(partner || {}))}</Note>
          </View>
        ) : group ? (
          <View style={{ gap: spacing.lg }}>
            {split.all.length > 0 && <TitleSection label={T.overlap.savedByAll} titles={split.all} onOpen={openTitle} />}
            {split.some.length > 0 && <TitleSection label={T.overlap.savedBySome} titles={split.some} onOpen={openTitle} who={title => T.overlap.savedBy(title.saved_by.map(nameOf))} />}
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            {top && (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <PosterThumb path={top.poster_path} width={96} height={144} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <SectionLabel>{T.overlap.topMatch}</SectionLabel>
                  <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{top.title}</Text>
                  {!!titleMeta(top) && <Note>{titleMeta(top)}</Note>}
                  <ButtonRow>
                    <Button variant="primary" label={T.overlap.choose} onPress={() => openTitle(top)} />
                    <Button label={T.overlap.shuffle} onPress={() => setTopId(shufflePick(shown, top.tmdb_id)?.tmdb_id ?? null)} />
                  </ButtonRow>
                </View>
              </View>
            )}
            {rest.length > 0 && <TitleSection label={T.overlap.alsoOnBoth} titles={rest} onOpen={openTitle} />}
          </View>
        )}
      {!group && partner && (
        <View style={{ gap: spacing.sm }}>
          <Note>{existing ? T.sharedList.summary(existing.name, existing.items?.length ?? 0) : T.sharedList.want(personName(partner))}</Note>
          {existing
            ? <Button label={T.sharedList.open} onPress={() => router.push('/(app)/my-lists' as Href)} />
            : <Button label={T.sharedList.make} onPress={makeList} />}
        </View>
      )}
      {sharing && partner && (
        <ShareListSheet partner={partner} overlapCount={titles.length} onClose={() => setSharing(false)} />
      )}
      <UpgradeSheet visible={upgrade} reason="collaborativeLists" onClose={() => setUpgrade(false)} onCompare={() => openPremium(router)} />
    </WatchPage>
  );
}

function TitleSection({ label, titles, onOpen, who }: {
  label: string;
  titles: WtTitle[];
  onOpen: (title: WtTitle) => void;
  who?: (title: WtTitle) => string;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel>{label}</SectionLabel>
      {titles.map(title => (
        <ListRow
          key={`${title.media_type}:${title.tmdb_id}`}
          posterUri={posterUrl(title.poster_path, 'w185')}
          title={title.title || ''}
          meta={titleMeta(title) || undefined}
          detail={who ? who(title) : undefined}
          onPress={() => onOpen(title)}
        />
      ))}
    </View>
  );
}

function NotPairedYet({ username, refresh }: { username: string; refresh: () => Promise<void> }) {
  const [person, setPerson] = useState<WtPerson | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void supabase.rpc('get_profile_card', { p_username: username }).then(({ data }) => {
      if (!live) return;
      const row = Array.isArray(data) ? data[0] : data;
      setPerson(asPerson(row));
    }, () => { if (live) setPerson(null); });
    return () => { live = false; };
  }, [username]);
  return (
    <WatchPage>
      {person === undefined ? <Note>{COMMON.loading}</Note>
        : person ? <WatchTogetherTile person={person} onChange={refresh} />
        : <Note>{T.overlap.notPartners}</Note>}
    </WatchPage>
  );
}

import { useEffect, useState } from 'react';
import { Animated, Dimensions, Image, PanResponder, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { personName, sessionProgress, swipeDecision, SWIPE_THRESHOLD } from '@plot/core/watchTogether.js';
import { useWatchTogetherSession, startWatchTogetherSession, liveWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COMMON } from '@plot/core/copy/common.js';
import { posterUrl, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import {
  BackRow, ButtonRow, Note, PageTitle, PosterThumb, PrimaryButton, SecondaryButton, SectionLabel, WatchPage, useOpenTitle,
} from './WatchChrome';
import { asResult, errorText, sessionIdFrom, titleMeta, useTogether } from './watchModel';
import { useAppData } from '../../contexts/AppDataContext';

export function WatchSession({ sessionId }: { sessionId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openTitle = useOpenTitle();
  const { userId } = useAppData();
  const together = useTogether(userId);
  const { session, error, loading, vote } = useWatchTogetherSession(sessionId);
  const [showMatches, setShowMatches] = useState(false);
  const [justMatched, setJustMatched] = useState<{ tmdb_id: number; media_type: string; title?: string | null; poster_path?: string | null } | null>(null);
  const other = together.partners.find(person => person.id === session?.other_id);
  const name = personName(other || {});
  const progress = sessionProgress(session);

  const decide = async (yes: boolean) => {
    const card = progress.card;
    if (!card) return;
    setJustMatched(null);
    const result = await vote(card, yes);
    if (result.matched) setJustMatched(card);
  };
  const restart = async () => {
    if (!session) return;
    const id = sessionIdFrom(asResult(await startWatchTogetherSession(session.other_id)));
    if (id) router.replace(`/(app)/together/session/${id}` as Href);
  };

  if (loading && !session) {
    return <WatchPage><Note>{COMMON.loading}</Note></WatchPage>;
  }
  if (error || !session) {
    return <WatchPage><Note>{errorText(error || 'generic')}</Note></WatchPage>;
  }

  const matchList = (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel>{T.session.matchesTitle}</SectionLabel>
      {progress.matches.length === 0 && <Note>{T.session.noMatches}</Note>}
      {progress.matches.map(title => (
        <View key={`${title.media_type}:${title.tmdb_id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <PosterThumb path={title.poster_path} width={44} height={66} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{title.title}</Text>
            {!!titleMeta(title) && <Note>{titleMeta(title)}</Note>}
          </View>
          <SecondaryButton label={T.session.choose} onPress={() => openTitle(title)} />
        </View>
      ))}
    </View>
  );

  const body = !session.live ? (
    <View style={{ gap: spacing.md }}>
      <Note>{T.session.ended}</Note>
      <PrimaryButton label={T.session.startAgain} onPress={restart} />
      {matchList}
    </View>
  ) : progress.total === 0 ? (
    <Note>{T.session.empty(name)}</Note>
  ) : showMatches ? (
    <View style={{ gap: spacing.md }}>
      {matchList}
      <SecondaryButton label={T.session.hideMatches} onPress={() => setShowMatches(false)} />
    </View>
  ) : progress.done ? (
    <View style={{ gap: spacing.md }}>
      <PageTitle>{T.session.doneTitle}</PageTitle>
      <Note>{T.session.doneBody(name)}</Note>
      {matchList}
    </View>
  ) : (
    <View style={{ flex: 1, gap: spacing.md }}>
      {justMatched && (
        <View style={{ gap: spacing.xs }}>
          <SectionLabel>{T.session.bothIn}</SectionLabel>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{justMatched.title}</Text>
          <PrimaryButton label={T.session.choose} onPress={() => openTitle(justMatched)} />
        </View>
      )}
      {progress.card && (
        <SessionCard
          key={`${progress.card.media_type}:${progress.card.tmdb_id}`}
          card={progress.card}
          counter={T.session.counter(progress.index + 1, progress.total)}
          onDecide={decide}
        />
      )}
      <Note>{T.session.swipeHint}</Note>
      <ButtonRow>
        <SecondaryButton label={T.session.no} onPress={() => decide(false)} flex />
        <PrimaryButton label={T.session.yes} onPress={() => decide(true)} flex />
      </ButtonRow>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <Note>{T.session.matchesSoFar(progress.matches.length)}</Note>
        <SecondaryButton label={T.session.seeMatches} onPress={() => setShowMatches(true)} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <BackRow label={T.session.leave} backTo="/(app)/together" />
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <PageTitle>{T.session.heading(name)}</PageTitle>
        <Note>{T.session.fromBoth}</Note>
        <Note>{`${personName(other || {})}: ${T.session.theyAnswered(Math.min(session.other_answered + 1, progress.total))}`}</Note>
      </View>
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        {body}
      </View>
    </View>
  );
}

function SessionCard({ card, counter, onDecide }: {
  card: { tmdb_id: number; media_type: string; title?: string | null; poster_path?: string | null; release_date?: string | null };
  counter: string;
  onDecide: (yes: boolean) => void;
}) {
  const { colors } = useTheme();
  const width = Math.min(Dimensions.get('window').width - spacing.xl * 2, 420);
  const height = Math.min(width * 1.25, 480);
  const [dx] = useState(() => new Animated.Value(0));
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => {
      dx.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      const decision = swipeDecision(g.dx);
      Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      if (decision) onDecide(decision === 'yes');
    },
    onPanResponderTerminate: () => {
      Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    },
  });
  const url = posterUrl(card.poster_path, 'w500');
  const yesOpacity = dx.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const noOpacity = dx.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <Animated.View
      {...pan.panHandlers}
      style={{
        width,
        height,
        borderRadius: radii.lg,
        overflow: 'hidden',
        backgroundColor: colors.surfaceSunken,
        alignSelf: 'center',
        transform: [
          { translateX: dx },
          { rotate: dx.interpolate({ inputRange: [-220, 220], outputRange: ['-8deg', '8deg'], extrapolate: 'clamp' }) },
        ],
      }}
    >
      {url ? <Image source={{ uri: url }} style={{ width, height }} resizeMode="cover" /> : null}
      <View style={{ position: 'absolute', left: spacing.md, top: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.pill, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: '#fff' }}>{counter}</Text>
      </View>
      <Animated.Text style={{ position: 'absolute', top: spacing.lg, left: spacing.lg, fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff', opacity: yesOpacity }}>{T.session.yes}</Animated.Text>
      <Animated.Text style={{ position: 'absolute', top: spacing.lg, right: spacing.lg, fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff', opacity: noOpacity }}>{T.session.no}</Animated.Text>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' }}>{card.title}</Text>
        {!!titleMeta(card) && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: '#fff' }}>{titleMeta(card)}</Text>}
      </View>
    </Animated.View>
  );
}

export function WatchJoin({ username }: { username: string }) {
  const router = useRouter();
  const { userId } = useAppData();
  const together = useTogether(userId);
  const partner = together.partners.find(person => person.username === username);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (together.loading || !partner) return undefined;
    let live = true;
    void liveWatchTogetherSession(partner.id).then(result => {
      if (!live) return;
      const id = sessionIdFrom(asResult(result));
      if (id) router.replace(`/(app)/together/session/${id}` as Href);
      else setMissing(true);
    });
    return () => { live = false; };
  }, [together.loading, partner, router]);
  if (!together.loading && !partner) return <WatchPage><Note>{T.overlap.notPartners}</Note></WatchPage>;
  if (!missing) return <WatchPage><Note>{COMMON.loading}</Note></WatchPage>;
  return (
    <WatchPage>
      <Note>{T.session.ended}</Note>
      <PrimaryButton label={T.tile.pairedAction} onPress={() => router.push(`/(app)/together/with/${encodeURIComponent(username)}` as Href)} />
    </WatchPage>
  );
}

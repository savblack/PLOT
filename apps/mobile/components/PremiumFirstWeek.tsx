/**
 * Home's card for a new Premium member: the RN counterpart of
 * apps/web/src/components/PremiumFirstWeek.jsx. Five things to try in the
 * first week, each ticking only when it has really been done. The rules, the
 * copy and the stored state's shape live in @plot/core/premiumFirstWeek.js
 * and copy/premiumFirstWeek.js; the card is drawn with Finishing touches'
 * styles and takes its place on Home while it shows.
 *
 * Collapsed by default with Dismiss in the header, same as Finishing touches
 * on a phone. When the week starts is the one thing that differs from web:
 * see lib/premiumFirstWeek.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { IconChevronDown } from './icons';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { useWatchTogether } from '@plot/core/useWatchTogether.js';
import {
  derivePremiumFirstWeek, premiumFirstWeekVisible,
  type PremiumFirstWeekId, type PremiumFirstWeekState,
} from '@plot/core/premiumFirstWeek.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_FAMILY } from '@plot/core/themes.js';
import { oncePerSession } from '@plot/core/oncePerSession.js';
import { PREMIUM_FIRST_WEEK as T } from '@plot/core/copy/premiumFirstWeek.js';
import { COMMON } from '@plot/core/copy/common.js';
import { track, EVENTS } from '../lib/analytics';
import { closePremiumFirstWeek, hidePremiumFirstWeekFor, notePremiumPlan } from '../lib/premiumFirstWeek';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { ChecklistTick, makeChecklistStyles } from './FinishingTouches';
import { TextLink } from './Button';

/** Where each step's button leads: mobile's own screen for each of core's PREMIUM_FIRST_WEEK_PATHS. */
const ROUTES: Record<PremiumFirstWeekId, string> = {
  theme: '/(app)/themes',
  people: '/(app)/your-people',
  together: '/(app)/together',
  // The calendar subscription is in Settings, Connections, as on web.
  calendar: '/(app)/settings?section=connections',
  smartList: '/(app)/my-lists',
};

/**
 * The stored week for this account, started here when the phone sees the
 * account turn Premium. `visible` is false until AsyncStorage has answered.
 */
export function usePremiumFirstWeekState(
  userId: string | null | undefined,
  profile: { is_premium?: boolean | null } | null | undefined,
  accountCreatedAt: string | null | undefined,
) {
  const [loaded, setLoaded] = useState<{ userId: string; state: PremiumFirstWeekState | null } | null>(null);
  // null while the profile is loading: neither plan has been seen yet.
  const isPremium = profile ? isPremiumProfile(profile) : null;
  useEffect(() => {
    if (!userId || isPremium === null) return undefined;
    let alive = true;
    notePremiumPlan(userId, { isPremium, accountCreatedAt }).then(({ state, started }) => {
      // Counted once, when the week really starts, as on web.
      if (started) track(EVENTS.PREMIUM_FIRST_WEEK_STARTED);
      if (alive) setLoaded({ userId, state });
    });
    return () => { alive = false; };
  }, [userId, isPremium, accountCreatedAt]);
  const state = loaded && loaded.userId === userId ? loaded.state : null;
  const setState = (next: PremiumFirstWeekState | null) => { if (userId) setLoaded({ userId, state: next }); };
  return { state, setState, visible: !!userId && premiumFirstWeekVisible(state, { isPremium: isPremium === true }) };
}

/**
 * Mounted by Home only while the week is showing.
 * onState: the stored state after Dismiss or the final "Nice", so Home can
 * give the slot back to Finishing touches.
 */
export default function PremiumFirstWeek({ onState }: { onState: (next: PremiumFirstWeekState | null) => void }) {
  const { colors, family } = useTheme();
  const styles = useMemo(() => makeChecklistStyles(colors), [colors]);
  const router = useRouter();
  const { userId, profile, customLists } = useAppData();
  const [expanded, setExpanded] = useState(false);
  const people = usePeopleFollows(userId);
  const together = useWatchTogether(userId);

  const peopleCount = people.follows.length;
  const smartListCount = (customLists?.smartLists || []).length;
  const { steps, doneCount, total, allDone } = derivePremiumFirstWeek({
    themeChosen: !!family && family !== DEFAULT_FAMILY,
    peopleCount,
    togetherCount: (together.partners?.length ?? 0) + (together.outgoing?.length ?? 0),
    calendarOn: !!profile?.calendar_token,
    smartListCount,
  });

  useEffect(() => {
    if (people.loading || together.loading) return;
    oncePerSession('premium_first_week_viewed', () => {
      track(EVENTS.PREMIUM_FIRST_WEEK_VIEWED, { done_count: doneCount, total });
    });
  }, [people.loading, together.loading, doneCount, total]);

  if (!userId) return null;

  const tiles = steps.map(step => {
    const copy = T.steps[step.id];
    const doneSub = typeof copy.doneSub === 'function'
      ? copy.doneSub(step.id === 'people' ? peopleCount : smartListCount)
      : copy.doneSub;
    return { id: step.id, done: step.done, title: copy.title, sub: step.done ? doneSub : copy.sub, cta: copy.cta };
  });

  if (allDone) {
    return (
      <View style={styles.ready} accessibilityLiveRegion="polite">
        <View style={styles.readyMark}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.onAccentFill} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12l5 5L19 7" />
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.readyTitle}>{T.ready}</Text>
          <Text style={styles.readyBody}>{T.readyBody}</Text>
        </View>
        <TouchableOpacity
          style={styles.pill}
          onPress={async () => onState(await closePremiumFirstWeek(userId))}
          accessibilityRole="button"
        >
          <Text style={styles.pillText}>{T.nice}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel={T.title}>
      <View style={styles.head}>
        {/* The title is longer than Finishing touches', and the shared head
            row wraps: on a phone the arrow fell to a line of its own. This
            row does not wrap; the title gives way instead, shrinking a little
            before it would ever push Dismiss or the arrow off the line. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
        <Text style={[styles.title, { flex: 1 }]} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{T.title}</Text>
        <TouchableOpacity
          onPress={async () => {
            track(EVENTS.PREMIUM_FIRST_WEEK_HIDDEN, { done_count: doneCount });
            onState(await hidePremiumFirstWeekFor(userId));
          }}
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <Text style={styles.hide}>{COMMON.dismiss}</Text>
        </TouchableOpacity>
        <Text style={styles.count}>{T.count(doneCount, total)}</Text>
        <TouchableOpacity
          onPress={() => setExpanded(open => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? T.collapse : T.expand}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconChevronDown size={18} color={colors.textSecondary} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
        </TouchableOpacity>
        </View>
        <View style={styles.barFull} accessibilityRole="image" accessibilityLabel={T.progressLabel(doneCount, total)}>
          {tiles.map((tile, i) => <View key={tile.id} style={[styles.barSeg, i < doneCount && styles.barSegOn]} />)}
        </View>
      </View>

      {expanded && (
        <View style={styles.tiles}>
          {tiles.map(tile => (
            <View key={tile.id} style={[styles.tile, tile.done && styles.tileDone]}>
              <View style={styles.tileHead}>
                <ChecklistTick done={tile.done} labels={T} />
                <Text style={styles.tileTitle}>{tile.title}</Text>
              </View>
              <Text style={styles.tileSub}>{tile.sub}</Text>
              {!tile.done && (
                <TextLink
                  tone="accent"
                  label={`${tile.cta} →`}
                  style={styles.tileCta}
                  onPress={() => {
                    track(EVENTS.PREMIUM_FIRST_WEEK_OPENED, { step: tile.id });
                    router.push(ROUTES[tile.id] as Href);
                  }}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

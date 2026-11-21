// Watch together's mood step, at /together/decide/[username] (Nov 21 2026).
// Before the cards: Movies or TV, any number of moods, and My services. Each
// chip shows how many shared titles it keeps, a chip that keeps none can't be
// picked, and when the choices together keep nothing, the card offers the one
// change that brings titles back. The deck is then only what fits
// (start_watch_together_session_filtered). Rules: @plot/core watchTogether.js,
// "The mood step". Web parity: apps/web/src/components/WatchTogetherMood.jsx.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  NO_MOOD, personName, moodsFor, filterByMood, moodCounts, moodFixes, toggleMoodChoice, setMoodKind,
  type MoodChoice, type MoodKind,
} from '@plot/core/watchTogether.js';
import { startWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { TONIGHT_PICKER as TP } from '@plot/core/copy/tonightPicker.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { COMMON } from '@plot/core/copy/common.js';
import { EVENTS, track } from '../../lib/analytics';
import { fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import Button from '../Button';
import Chip, { ChipRow } from '../Chip';
import SectionTitle from '../SectionTitle';
import { Avatar } from '../Avatar';
import { ButtonRow, ErrorNote, Note, SectionLabel, WatchPage, openPremium } from './WatchChrome';
import { asResult, errorText, sessionIdFrom, useTogether, useTogetherTitles } from './watchModel';

const M = T.mood;
const KINDS: { value: MoodKind; label: string }[] = [
  { value: 'all', label: T.hub.both },
  { value: 'movie', label: TP.chips.movies },
  { value: 'tv', label: TP.chips.shows },
];

export function WatchMood({ username }: { username: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId, profile } = useAppData();
  const together = useTogether(userId);
  const partner = together.partners.find(person => person.username === username);
  const { titles, loading, error } = useTogetherTitles(partner ? [partner.id] : []);
  const streaming = profile?.streaming_providers;
  const providerIds = useMemo(() => pickerProviderIds(streaming), [streaming]);
  const [choice, setChoice] = useState<MoodChoice>(NO_MOOD);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // The titles load in an effect, so the first render has none yet: hold the
  // loading note until a load has begun rather than flash "nothing shared".
  const [began, setBegan] = useState(false);
  if (!began && loading) setBegan(true);
  const locked = error === 'premium_required';
  const name = personName(partner || {});

  useEffect(() => {
    if (locked) track(EVENTS.PREMIUM_GATE_HIT, { feature: 'watch_together' });
  }, [locked]);

  if (!together.loading && !partner) return <WatchPage><Note>{T.overlap.notPartners}</Note></WatchPage>;
  if (!partner || !began || (loading && !titles.length)) return <WatchPage><Note>{COMMON.loading}</Note></WatchPage>;
  if (locked) {
    return (
      <WatchPage>
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>{T.locked.title}</SectionTitle>
          <Note>{T.locked.body(name)}</Note>
          <ButtonRow>
            <Button variant="primary" label={T.start.getPremium} onPress={() => openPremium(router)} />
          </ButtonRow>
          <Note>{PLANS_PAGE.premium.priceSummary}</Note>
        </View>
      </WatchPage>
    );
  }
  if (error) return <WatchPage><ErrorNote>{errorText(error)}</ErrorNote></WatchPage>;
  if (!titles.length) return <WatchPage><Note>{T.session.empty(name)}</Note></WatchPage>;

  const kept = filterByMood(titles, choice, providerIds);
  const counts = moodCounts(titles, choice, providerIds);
  const fixes = kept.length ? [] : moodFixes(titles, choice, providerIds);
  const chose = choice.kind !== 'all' || choice.moods.length > 0 || choice.services;

  const start = async (withMood: boolean) => {
    setStarting(true);
    setStartError(null);
    const result = asResult(await startWatchTogetherSession(partner.id,
      withMood && chose ? { choice, providerIds, deckSize: kept.length } : null));
    setStarting(false);
    const id = sessionIdFrom(result);
    if (id) router.replace(`/(app)/together/session/${id}` as Href);
    else setStartError(errorText(result.code));
  };

  const card = { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md };

  return (
    <WatchPage>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Avatar url={partner.avatar_url} name={name} size={28} colors={colors} />
        <Note>{T.session.heading(name)}</Note>
      </View>
      <View style={{ gap: spacing.xs }}>
        <SectionTitle>{TP.moodTitle}</SectionTitle>
        <Note>{M.fromShared(titles.length)}</Note>
      </View>

      <View style={card} accessibilityLabel={TP.moodTitle}>
        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{M.kindLabel}</SectionLabel>
          <ChipRow>
            {KINDS.map(k => (
              <Chip key={k.value} size="sm" label={k.label} accessibilityRole="radio"
                quiet={k.value === 'all'} selected={choice.kind === k.value}
                onPress={() => setChoice(c => setMoodKind(c, k.value))} />
            ))}
          </ChipRow>
        </View>
        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{M.moodLabel}</SectionLabel>
          <ChipRow>
            {moodsFor(choice.kind).map(m => {
              const on = choice.moods.includes(m);
              const count = counts[m] ?? 0;
              return (
                <Chip key={m} size="sm" label={TP.chips.moods[m]} count={count} selected={on} accessibilityRole="checkbox"
                  disabled={!on && !count} onPress={() => setChoice(c => toggleMoodChoice(c, m))} />
              );
            })}
          </ChipRow>
        </View>
        {providerIds.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <SectionLabel>{M.whereLabel}</SectionLabel>
            <ChipRow>
              <Chip size="sm" label={TP.summary.services} selected={choice.services} accessibilityRole="checkbox"
                onPress={() => setChoice(c => ({ ...c, services: !c.services }))} />
            </ChipRow>
          </View>
        )}
      </View>

      {kept.length === 0 && (
        <View style={card} accessibilityRole="summary">
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{M.noneTitle}</Text>
            <Note>{M.noneBody}</Note>
          </View>
          <View>
            {fixes.map((f, i) => (
              <TouchableOpacity
                key={f.change}
                onPress={() => setChoice(f.choice)}
                accessibilityRole="button"
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
                  paddingVertical: spacing.sm,
                  borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border,
                }}
              >
                <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{M.fixes[f.change]}</Text>
                <Note>{M.fixCount(f.count)}</Note>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {!!startError && <ErrorNote>{startError}</ErrorNote>}
      <ButtonRow>
        <Button variant="primary" label={M.start(kept.length)} disabled={!kept.length} busy={starting} onPress={() => start(true)} />
        <Button size="sm" label={M.skip(titles.length)} disabled={starting} onPress={() => start(false)} style={{ alignSelf: 'center' }} />
      </ButtonRow>
    </WatchPage>
  );
}

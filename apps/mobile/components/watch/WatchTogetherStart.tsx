import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { pickDemoDeck, demoPartnerSaysYes } from '@plot/core/watchTogether.js';
import { useWatchTogetherExampleTitles } from '@plot/core/useWatchTogether.js';
import { supabase } from '@plot/core/supabase.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useRouter } from 'expo-router';
import {
  ButtonRow, Chip, ErrorNote, InkCard, InkText, InkTitle, ListCard, Note, PersonRow, PosterThumb, PrimaryButton, SecondaryButton, SectionLabel, openPremium, useInk,
} from './WatchChrome';
import { readStorage, writeStorage } from '../../lib/storage';
import { useInviteShare } from './InviteLinkCard';
import { WtPerson, WtTitle, asPeople, asTitles, titleMeta } from './watchModel';

const S = T.start;

export default function WatchTogetherStart({ premium, suggested, onInvite }: {
  premium: boolean;
  suggested: WtPerson[];
  onInvite: (person: WtPerson) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { watchlist } = useAppData();
  const saved = Array.isArray(watchlist?.items) ? watchlist.items : null;
  const titles = asTitles(useWatchTogetherExampleTitles(saved));
  const [sent, setSent] = useState<string[]>([]);
  const invite = async (person: WtPerson) => {
    const ok = await onInvite(person);
    if (ok) setSent(prev => prev.includes(person.id) ? prev : [...prev, person.id]);
    return ok;
  };

  return (
    <View style={{ gap: spacing.xl }}>
      {premium && <Welcome />}
      <Hero titles={titles} premium={premium} sent={sent} onInvite={invite} />
      {suggested.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, color: colors.textPrimary }}>{S.peopleTitle}</Text>
          <Note>{S.peopleNote}</Note>
          <ListCard>
            {suggested.map(person => (
              <PersonRow
                key={person.id}
                person={person}
                note={typeof person.overlap_count === 'number' ? S.inCommon(person.overlap_count) : S.countLater}
                trailing={sent.includes(person.id)
                  ? <Chip label={T.invite.sent} />
                  : <SecondaryButton label={T.invite.invite} onPress={() => invite(person)} />}
              />
            ))}
          </ListCard>
          <Note>{T.invite.mutualNote}</Note>
        </View>
      )}
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, color: colors.textPrimary }}>{premium ? S.seeItTitle : S.tryTitle}</Text>
        <Note>{premium ? S.premiumSeeItBody : S.tryBody}</Note>
        <Demo key={titles.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={titles} />
      </View>
      {!premium && (
        <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface }}>
          <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, color: colors.textPrimary }}>{S.premiumCardTitle}</Text>
          <Note>{S.premiumCardBody}</Note>
          <PrimaryButton label={S.getPremium} onPress={() => openPremium(router)} />
          <Note>{PLANS_PAGE.premium.priceSummary}</Note>
        </View>
      )}
    </View>
  );
}

const WELCOME_KEY = 'plot_wt_welcome_dismissed';

/** "You're on Premium": stays until dismissed. */
function Welcome() {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let live = true;
    void readStorage(WELCOME_KEY).then(raw => { if (live) setHidden(raw === '1'); });
    return () => { live = false; };
  }, []);
  if (hidden) return null;
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.accentSecondaryFill }}>
      <Text style={{ flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.onAccentSecondaryFill }}>
        <Text style={{ fontFamily: fontFamily.sansBold }}>{`${S.welcomeTitle} `}</Text>{S.welcomeBody}
      </Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={T.hub.dismiss} onPress={() => { void writeStorage(WELCOME_KEY, '1'); setHidden(true); }} hitSlop={12}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.onAccentSecondaryFill} strokeWidth={2} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
      </TouchableOpacity>
    </View>
  );
}

/** The dark top card: one job, find someone to watch with. */
function Hero({ titles, premium, sent, onInvite }: {
  titles: WtTitle[];
  premium: boolean;
  sent: string[];
  onInvite: (person: WtPerson) => Promise<boolean>;
}) {
  const ink = useInk();
  const { url, send } = useInviteShare();
  return (
    <InkCard>
      <PairPreview titles={titles} />
      <InkTitle>{premium ? S.premiumPitchTitle : S.pitchTitle}</InkTitle>
      <InkText>{premium ? S.premiumPitchBody : S.pitchBody}</InkText>
      <FriendSearch sent={sent} onInvite={onInvite} />
      <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: ink.note, textAlign: 'center' }}>{T.link.inviteBody}</Text>
      <PrimaryButton label={T.link.share} onPress={() => send('share')} disabled={!url} />
    </InkCard>
  );
}

/** A fan of your own posters and an example pairing, on the dark card. */
function PairPreview({ titles }: { titles: WtTitle[] }) {
  const ink = useInk();
  const shown = titles.slice(0, 5);
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {shown.map((title, i) => (
          <View key={`${title.media_type}:${title.tmdb_id}`} style={{ marginLeft: i ? -14 : 0, transform: [{ rotate: `${(i - 2) * 3.5}deg` }, { translateY: -Math.abs(i - 2) * 3 }], borderRadius: radii.sm, borderWidth: 3, borderColor: ink.bg }}>
            <PosterThumb path={title.poster_path} width={52} height={78} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: ink.raised }}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="#FF88C8">
          <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
        </Svg>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: ink.text }}>{`${S.examplePair} · ${S.exampleCount}`}</Text>
      </View>
      <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: 11, color: ink.note }}>{S.example}</Text>
    </View>
  );
}

/** Search people by name or @username to invite. Results open under the box. */
function FriendSearch({ sent, onInvite }: {
  sent: string[];
  onInvite: (person: WtPerson) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const { userId } = useAppData();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<WtPerson[] | null>(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();
  const searching = q.length >= 2;

  useEffect(() => {
    if (q.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void supabase.rpc('search_users', { p_query: q }).then(({ data }: { data: unknown }) => {
        if (live) setFound(asPeople(data).filter(person => person.id !== userId).slice(0, 5));
      });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q, userId]);

  const invite = async (person: WtPerson) => {
    setFailed(false);
    if (!(await onInvite(person))) setFailed(true);
  };
  const results = searching ? found : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={T.invite.search}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={S.findLabel}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: 48,
          borderRadius: radii.pill,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          color: colors.textPrimary,
          fontFamily: fontFamily.sans,
          fontSize: fontSize.md,
        }}
      />
      {failed && <ErrorNote>{T.errors.generic}</ErrorNote>}
      {results && (
        <View style={{ borderRadius: radii.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md }}>
          {results.length === 0 && <View style={{ paddingVertical: spacing.md }}><Note>{S.findNone}</Note></View>}
          {results.map(person => (
            <PersonRow
              key={person.id}
              person={person}
              note={person.username ? `@${person.username}` : undefined}
              trailing={sent.includes(person.id)
                ? <Chip label={T.invite.sent} />
                : <SecondaryButton label={T.invite.invite} onPress={() => invite(person)} />}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Demo({ premium, pool }: { premium: boolean; pool: WtTitle[] }) {
  const [deck, setDeck] = useState(() => pickDemoDeck(pool));
  const [index, setIndex] = useState(0);
  const [match, setMatch] = useState<WtTitle | null>(null);
  const [last, setLast] = useState<{ title: string; mine: boolean; theirs: boolean } | null>(null);
  const card = deck[index];
  const say = (yes: boolean) => (yes ? T.session.yes : T.session.no);
  const again = () => { setDeck(pickDemoDeck(pool)); setIndex(0); setMatch(null); setLast(null); };
  const answer = (yes: boolean) => {
    if (!card) return;
    const theirs = demoPartnerSaysYes({ index, total: deck.length, matchedSoFar: !!match });
    setLast({ title: card.title || '', mine: yes, theirs });
    if (yes && theirs) setMatch(card);
    setIndex(i => i + 1);
  };
  const router = useRouter();
  const { colors } = useTheme();
  const head = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <SectionLabel>{S.demoHeading}</SectionLabel>
      <SectionLabel>{S.example}</SectionLabel>
    </View>
  );
  const response = last && (
    <View style={{ gap: spacing.xs }}>
      <Note>{last.title}</Note>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: last.mine ? colors.accent : colors.textSecondary }}>{S.demoYouSaid(say(last.mine))}</Text>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: last.theirs ? colors.accent : colors.textSecondary }}>{S.demoTheySaid(S.exampleName, say(last.theirs))}</Text>
    </View>
  );
  if (!deck.length) {
    return <View style={{ gap: spacing.sm }}>{head}<Note>{S.demoEmpty}</Note></View>;
  }
  if (match) {
    return (
      <View style={{ gap: spacing.sm }}>
        {head}
        <PosterThumb path={match.poster_path} width={120} height={180} />
        <SectionLabel>{S.demoDoneTitle}</SectionLabel>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{match.title}</Text>
        <Note>{S.demoDoneBody}</Note>
        <ButtonRow>
          {!premium && <PrimaryButton label={S.getPremium} onPress={() => openPremium(router)} />}
          <SecondaryButton label={S.demoAgain} onPress={again} />
        </ButtonRow>
      </View>
    );
  }
  if (!card) {
    return (
      <View style={{ gap: spacing.sm }}>
        {head}
        {response}
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{S.demoNoMatchTitle}</Text>
        <Note>{S.demoNoMatchBody}</Note>
        <SecondaryButton label={S.demoAgain} onPress={again} />
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {head}
      <PosterThumb path={card.poster_path} width={160} height={240} />
      <Note>{T.session.counter(index + 1, deck.length)}</Note>
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{card.title}</Text>
      {!!titleMeta(card) && <Note>{titleMeta(card)}</Note>}
      <ButtonRow>
        <SecondaryButton label={T.session.no} onPress={() => answer(false)} />
        <PrimaryButton label={T.session.yes} onPress={() => answer(true)} />
      </ButtonRow>
      {response}
      <Note>{S.demoNote}</Note>
    </View>
  );
}

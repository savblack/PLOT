import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { personName, pickDemoDeck, demoPartnerSaysYes } from '@plot/core/watchTogether.js';
import { useWatchTogetherExampleTitles } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { readStorage, writeStorage } from '../../lib/storage';
import { useRouter } from 'expo-router';
import {
  ButtonRow, Note, PageTitle, PersonFace, PosterThumb, PrimaryButton, SecondaryButton, SectionLabel, openPremium,
} from './WatchChrome';
import { InviteLinkCard } from './InviteLinkCard';
import { WtPerson, WtTitle, asTitles, titleMeta } from './watchModel';

const S = T.start;
const WELCOME_KEY = 'plot_wt_premium_welcome_dismissed';

export default function WatchTogetherStart({ premium, suggested, onInvite }: {
  premium: boolean;
  suggested: WtPerson[];
  onInvite: (person: WtPerson) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const { watchlist } = useAppData();
  const saved = Array.isArray(watchlist?.items) ? watchlist.items : null;
  const titles = asTitles(useWatchTogetherExampleTitles(saved));
  const [sent, setSent] = useState<string[]>([]);
  const invite = async (person: WtPerson) => {
    if (await onInvite(person)) setSent(prev => prev.includes(person.id) ? prev : [...prev, person.id]);
  };
  const overlaps = suggested.length > 0
    ? <Overlaps people={suggested} premium={premium} sent={sent} onInvite={invite} />
    : <Pitch premium={premium} />;

  if (premium) {
    return (
      <View style={{ gap: spacing.xl }}>
        <PremiumWelcome />
        {overlaps}
        <InviteLinkCard />
        {suggested.length > 0 && <HowItWorks premium />}
        <View style={{ gap: spacing.sm }}>
          <PageTitle>{S.seeItTitle}</PageTitle>
          <Note>{S.premiumSeeItBody}</Note>
          <Demo key={titles.length >= 5 ? 'ready' : 'waiting'} premium pool={titles} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xl }}>
      {overlaps}
      <View style={{ gap: spacing.sm }}>
        <PageTitle>{S.seeItTitle}</PageTitle>
        <Note>{S.seeItBody}</Note>
        <Example titles={titles} />
        <Demo key={titles.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={titles} />
      </View>
      {suggested.length > 0 && <HowItWorks premium={false} />}
      <InviteLinkCard />
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{S.gotInviteTitle}</Text>
        <Note>{S.gotInviteBody}</Note>
      </View>
    </View>
  );
}

function PremiumPrompt({ label }: { label: string }) {
  const router = useRouter();
  return (
    <View style={{ gap: spacing.sm }}>
      <PrimaryButton label={label} onPress={() => openPremium(router)} />
      <Note>{S.premiumNote(PLANS_PAGE.premium.priceSummary)}</Note>
    </View>
  );
}

function Overlaps({ people, premium, sent, onInvite }: {
  people: WtPerson[];
  premium: boolean;
  sent: string[];
  onInvite: (person: WtPerson) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <PageTitle>{S.overlapsTitle}</PageTitle>
      <Note>{premium ? S.premiumOverlapsBody : S.overlapsBody}</Note>
      {people.map(person => (
        <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <PersonFace person={person} />
          <Text style={{ flex: 1, fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }} numberOfLines={1}>{personName(person)}</Text>
          <Note>{typeof person.overlap_count === 'number' ? S.inCommon(person.overlap_count) : S.countLater}</Note>
          {sent.includes(person.id)
            ? <SectionLabel>{T.invite.sent}</SectionLabel>
            : <SecondaryButton label={T.invite.invite} onPress={() => onInvite(person)} />}
        </View>
      ))}
      {!premium && <PremiumPrompt label={S.getPremium} />}
    </View>
  );
}

function Pitch({ premium }: { premium: boolean }) {
  return (
    <View style={{ gap: spacing.md }}>
      <PageTitle>{S.pitchTitle}</PageTitle>
      <Note>{S.pitchBody}</Note>
      {!premium && <PremiumPrompt label={S.getPremium} />}
      <HowItWorks premium={premium} />
    </View>
  );
}

function Example({ titles }: { titles: WtTitle[] }) {
  const shown = titles.slice(0, 5);
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <PersonFace person={{ display_name: S.exampleName }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{S.examplePair}</Text>
          <Note>{S.exampleCount}</Note>
        </View>
        <SectionLabel>{S.example}</SectionLabel>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {shown.map(title => (
          <View key={`${title.media_type}:${title.tmdb_id}`} style={{ width: 64 }}>
            <PosterThumb path={title.poster_path} width={64} height={96} />
            <Text style={{ fontFamily: fontFamily.sans, fontSize: 10, color: colors.textSecondary, marginTop: 4 }} numberOfLines={2}>{title.title}</Text>
          </View>
        ))}
      </View>
      {!!shown[0] && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill={colors.accent}>
            <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
          </Svg>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{S.exampleMatch(shown[0].title)}</Text>
            <Note>{S.exampleMatchNote}</Note>
          </View>
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

function HowItWorks({ premium }: { premium: boolean }) {
  const { colors } = useTheme();
  const steps = premium ? [{ ...S.steps[0], body: S.premiumFirstStep }, ...S.steps.slice(1)] : S.steps;
  return (
    <View style={{ gap: spacing.md }}>
      <PageTitle>{S.howTitle}</PageTitle>
      {steps.map((step, i) => (
        <View key={step.title} style={{ flexDirection: 'row', gap: spacing.md }}>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.accent, width: 20 }}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{step.title}</Text>
            <Note>{step.body}</Note>
          </View>
        </View>
      ))}
    </View>
  );
}

function PremiumWelcome() {
  const { colors } = useTheme();
  const [show, setShow] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void readStorage(WELCOME_KEY).then(value => { if (live) setShow(value !== '1'); });
    return () => { live = false; };
  }, []);
  if (!show) return null;
  const dismiss = () => {
    void writeStorage(WELCOME_KEY, '1');
    setShow(false);
  };
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
        <Path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <Path d="M6 19v2" />
        <Path d="M18 19v2" />
      </Svg>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{S.premiumTitle}</Text>
        <Note>{S.premiumBody}</Note>
      </View>
      <SecondaryButton label={T.hub.dismiss} onPress={dismiss} />
    </View>
  );
}

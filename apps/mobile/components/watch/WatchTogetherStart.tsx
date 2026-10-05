import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
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
  ButtonRow, ErrorNote, Note, PageTitle, PersonRow, PosterThumb, PrimaryButton, SecondaryButton, SectionLabel, openPremium,
} from './WatchChrome';
import { useInviteShare } from './InviteLinkCard';
import { WtPerson, WtTitle, asPeople, asTitles, titleMeta } from './watchModel';

const S = T.start;

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
    const ok = await onInvite(person);
    if (ok) setSent(prev => prev.includes(person.id) ? prev : [...prev, person.id]);
    return ok;
  };

  return (
    <View style={{ gap: spacing.xl }}>
      <FindCard titles={titles} people={suggested} premium={premium} sent={sent} onInvite={invite} />
      <View style={{ gap: spacing.sm }}>
        <PageTitle>{S.seeItTitle}</PageTitle>
        <Note>{premium ? S.premiumSeeItBody : S.seeItDemoBody}</Note>
        <Demo key={titles.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={titles} />
      </View>
      {!premium && (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{S.gotInviteTitle}</Text>
          <Note>{S.gotInviteBody}</Note>
        </View>
      )}
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

/** A fan of your own posters and an example pairing. */
function PairPreview({ titles }: { titles: WtTitle[] }) {
  const { colors } = useTheme();
  const shown = titles.slice(0, 5);
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken }}>
      <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {shown.map((title, i) => (
          <View key={`${title.media_type}:${title.tmdb_id}`} style={{ marginLeft: i ? -12 : 0, transform: [{ rotate: `${(i - 2) * 3}deg` }] }}>
            <PosterThumb path={title.poster_path} width={52} height={78} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.accent}>
          <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
        </Svg>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{`${S.examplePair} · ${S.exampleCount}`}</Text>
        <Note>{S.example}</Note>
      </View>
    </View>
  );
}

/**
 * Search people by name or @username to invite. Until you type, it lists the
 * suggested people (when there are any) with how many titles you share.
 */
function FriendSearch({ people, sent, onInvite }: {
  people: WtPerson[];
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
  const trailing = (person: WtPerson, withCount: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {withCount && <Note>{typeof person.overlap_count === 'number' ? S.inCommon(person.overlap_count) : S.countLater}</Note>}
      {sent.includes(person.id)
        ? <SectionLabel>{T.invite.sent}</SectionLabel>
        : <SecondaryButton label={T.invite.invite} onPress={() => invite(person)} />}
    </View>
  );
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
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.pill,
          paddingHorizontal: spacing.lg,
          color: colors.textPrimary,
          fontFamily: fontFamily.sans,
          fontSize: fontSize.md,
        }}
      />
      {failed && <ErrorNote>{T.errors.generic}</ErrorNote>}
      {results && results.length === 0 && <Note>{S.findNone}</Note>}
      {results && results.map(person => (
        <PersonRow key={person.id} person={person} note={`@${person.username}`} trailing={trailing(person, false)} />
      ))}
      {!searching && people.length > 0 && (
        <View>
          <SectionLabel>{T.invite.suggested}</SectionLabel>
          {people.map(person => (
            <PersonRow key={person.id} person={person} note={person.username ? `@${person.username}` : undefined} trailing={trailing(person, true)} />
          ))}
        </View>
      )}
      <Note>{T.invite.mutualNote}</Note>
    </View>
  );
}

/** Pick someone to pair up with: search, suggestions, or your invite link. */
function FindCard({ titles, people, premium, sent, onInvite }: {
  titles: WtTitle[];
  people: WtPerson[];
  premium: boolean;
  sent: string[];
  onInvite: (person: WtPerson) => Promise<boolean>;
}) {
  const { url, send } = useInviteShare();
  return (
    <View style={{ gap: spacing.md }}>
      <PairPreview titles={titles} />
      <PageTitle>{S.pitchTitle}</PageTitle>
      <Note>{S.pitchBody}</Note>
      <FriendSearch people={people} sent={sent} onInvite={onInvite} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}><Note>{S.shareNote}</Note></View>
        <SecondaryButton label={T.link.share} onPress={() => send('share')} disabled={!url} />
      </View>
      {!premium && <PremiumPrompt label={S.getPremium} />}
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

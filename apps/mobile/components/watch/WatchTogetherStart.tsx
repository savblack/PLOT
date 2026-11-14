// The pieces of Watch together's start page that the hub keeps: friend search
// and the try-it demo with an example partner. The page itself is now the
// hub's 'invite' stage (WatchHub.tsx), as on web (WatchTogetherStart.jsx
// exports Demo and FriendSearch to WatchTogetherHub.jsx).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SearchField from '../SearchField';
import { Tag } from '../Chip';
import Button from '../Button';
import { pickDemoDeck, demoPartnerSaysYes } from '@plot/core/watchTogether.js';
import { useUserSearch } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useRouter } from 'expo-router';
import { ButtonRow, ErrorNote, Note, PersonRow, PosterThumb, SectionLabel, openPremium } from './WatchChrome';
import { WtPerson, WtTitle, asPeople, titleMeta } from './watchModel';

const S = T.start;

/** Search people by name or @username to invite. Results open under the box. */
export function FriendSearch({ sent, onInvite }: {
  sent: string[];
  onInvite: (person: WtPerson) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const { userId } = useAppData();
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState(false);
  const search = useUserSearch(query, { excludeId: userId });
  const results = search.results ? asPeople(search.results) : null;

  const invite = async (person: WtPerson) => {
    setFailed(false);
    if (!(await onInvite(person))) setFailed(true);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <SearchField value={query} onChangeText={setQuery} placeholder={T.invite.search} accessibilityLabel={S.findLabel} />
      {failed && <ErrorNote>{T.errors.generic}</ErrorNote>}
      {results && (
        <View style={{ borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md }}>
          {results.length === 0 && <View style={{ paddingVertical: spacing.md }}><Note>{S.findNone}</Note></View>}
          {results.map(person => (
            <PersonRow
              key={person.id}
              person={person}
              note={person.username ? `@${person.username}` : undefined}
              trailing={sent.includes(person.id)
                ? <Tag label={T.invite.sent} style={{ alignSelf: 'center' }} />
                : <Button label={T.invite.invite} onPress={() => invite(person)} />}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function Demo({ premium, pool }: { premium: boolean; pool: WtTitle[] }) {
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
          {!premium && <Button variant="primary" label={S.getPremium} onPress={() => openPremium(router)} />}
          <Button label={S.demoAgain} onPress={again} />
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
        <Button label={S.demoAgain} onPress={again} />
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
        <Button label={T.session.no} onPress={() => answer(false)} />
        <Button variant="primary" label={T.session.yes} onPress={() => answer(true)} />
      </ButtonRow>
      {response}
      <Note>{S.demoNote}</Note>
    </View>
  );
}
